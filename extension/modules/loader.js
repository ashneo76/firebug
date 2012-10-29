/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var EXPORTED_SYMBOLS = ["FirebugLoader"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://firebug/fbtrace.js");

// ********************************************************************************************* //

function loadSubscript(src, win)
{
    return Services.scriptloader.loadSubScript(src, win);
}

// ********************************************************************************************* //

var FirebugLoader =
{
    bootstrapScopes: [],

    registerBootstrapScope: function(e)
    {
        if (this.bootstrapScopes.indexOf(e) != -1)
            return;

        this.bootstrapScopes.push(e);

        this.forEachWindow(function(win)
        {
            e.topWindowLoad(win);

            if (!win.Firebug.isInitialized)
                return;

            e.firebugFrameLoad(win.Firebug);
        })
    },

    unregisterBootstrapScope: function(e)
    {
        var i = this.bootstrapScopes.indexOf(e);
        if (i >= 0)
            this.bootstrapScopes.splice(i, 1);

        if (e.topWindowUnload)
        {
            this.forEachWindow(function(win)
            {
                e.topWindowUnload(win);
            })
        }

        if (e.firebugFrameUnload)
        {
            this.forEachWindow(function(win)
            {
                e.firebugFrameUnload(win.Firebug);
            })
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    startup: function()
    {
        // allow already started bootstrapped firebug extensions to register themselves
        var XPIProviderBP = Cu.import("resource://gre/modules/XPIProvider.jsm", {});
        var bootstrapScopes = XPIProviderBP.XPIProvider.bootstrapScopes;

        for each(var scope in bootstrapScopes)
        {
            try
            {
                if (scope.firebugStartup)
                    scope.firebugStartup(this);
            }
            catch(e)
            {
                Cu.reportError(e);
            }
        }
    },

    shutdown: function()
    {
        this.forEachWindow(function(win)
        {
            FirebugLoader.unloadFromWindow(win);
        })
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    unloadFromWindow: function(win)
    {
        var fbug = win.Firebug
        this.dispatchToScopes("topWindowUnload", [win]);

        if (fbug.shutdown)
        {
            fbug.closeFirebug();
            fbug.shutdown();
        }

        function getRoots(el)
        {
            return Array.slice(el.querySelectorAll("[firebugRootNode]"));
        }

        [getRoots(win.document), getRoots(win.gNavToolbox.palette),
            fbug.globalUI.nodesToRemove].forEach(function(list)
        {
            for each(var el in list)
                if (el && el.parentNode)
                    el.parentNode.removeChild(el);
        });

        win.Firebug.globalUI.unloadContextMenuOverlay(win);

        delete win.Firebug;
        delete win.FBTrace;
        delete win.FBL;
    },

    loadIntoWindow: function(win, reason)
    {
        // This is the place where the global Firebug object is created. This object represents
        // the entire application and all consequently created namespaces and variables should be
        // injected into it.
        // In the future, there should *not* be any other globals except of the Firebug object.
        win.Firebug = {};

        var requireScope = {};
        Cu.import("resource://firebug/mini-require.js", requireScope);
        var require = requireScope.require;

        var config = {
            baseUrl: "resource://",
            paths: {"firebug": "chrome://firebug/content"}
        };

        require(config, [
            "firebug/firefox/globalUI"
        ],
        function(GlobalUI)
        {
            var globalUI = win.Firebug.globalUI = new GlobalUI(win);
            globalUI.initialize(reason);
        });

        // Just for debugging purposes.
        /*var text = "";
        var deps = require.Loader.getDeps();
        for (var p in deps)
            text += p + "\n";
        FBTrace.sysout(text);*/

        // Firebug extensions should initialize here.
        this.dispatchToScopes("topWindowLoad", [win]);
    },

    dispatchToScopes: function(name, arguments)
    {
        for each (var e in this.bootstrapScopes)
        {
            try
            {
                if (name in e)
                    e[name].apply(e, arguments);
            }
            catch(e)
            {
                Cu.reportError(e);
            }
        }
    },

    forEachWindow: function(func)
    {
        var enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements())
        {
            try
            {
                var win = enumerator.getNext();
                if (win.Firebug)
                    func(win);
            }
            catch(e)
            {
                Cu.reportError(e);
            }
        }
    }
}

// ********************************************************************************************* //
