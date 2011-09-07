/* ***** BEGIN LICENSE BLOCK *****
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

The Original Code is the Site Navigation Toolbar from Mozilla 1.x.

The Initial Developer of the Original Code is Eric Hodel <drbrain@segment7.net>

Portions created by the Initial Developer are Copyright (C) 2001
the Initial Developer. All Rights Reserved.

Contributor(s):
  Christopher Hoess <choess@force.stwing.upenn.edu>
  Tim Taylor <tim@tool-man.org>
  Henri Sivonen <henris@clinet.fi>
  Stuart Ballard <sballard@netreach.net>
  Chris Neale <cdn@mozdev.org>
  Stephen Clavering <mozilla@clav.me.uk>
  King Brian

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.

***** END LICENSE BLOCK ***** */

var LinkWidgetsExtension = {

    linkWidgetPrefPrefix : "extensions.linkwidget.",

    // Used in link-guessing. Populated from preferences with related names.
    linkWidgetRegexps : {
      "ignore_rels": null,
      "guess_up_skip": null,
      "first": null,
      "prev": null,
      "next": null,
      "last": null,
      "img_first": null,
      "img_prev": null,
      "img_next": null,
      "img_last": null
    },

    // rels which should always use a submenu of the More menu, even for a single item
    linkWidgetMenuRels : {}, // rel -> true map
    _linkWidgetMenuRels : ["chapter", "section", "subsection", "bookmark", "alternate"],
    
    // known rels in the order they should appear on the More menu
    linkWidgetMenuOrdering : {}, // rel -> int map
    _linkWidgetMenuOrdering : [
      "top","up","first","prev","next","last","toc","chapter","section","subsection","appendix",
      "glossary","index","help","search","author","copyright","bookmark","alternate"
    ],

    linkWidgetButtonRels : {}, // rel -> true map
    _linkWidgetButtonRels : ["top","up","first","prev","next","last"],
    
    linkWidgetEventHandlers : {
      "select": "LinkWidgetsExtension.linkWidgetTabSelectedHandler",
      "DOMLinkAdded": "LinkWidgetsExtension.linkWidgetLinkAddedHandler",
      "pagehide": "LinkWidgetsExtension.linkWidgetPageHideHandler",
      "DOMContentLoaded": "LinkWidgetsExtension.linkWidgetPageLoadedHandler",
      "pageshow": "LinkWidgetsExtension.linkWidgetPageShowHandler"
    },

    linkWidgetPrefGuessUpAndTopFromURL : false,
    linkWidgetPrefGuessPrevAndNextFromURL : false,
    linkWidgetPrefScanHyperlinks : false,
    linkWidgetStrings : "chrome://linkwidget/locale/main.strings",
    linkWidgetButtons : {}, // rel -> <toolbarbutton> map
    linkWidgetViews : {},   // rel -> view map, the views typically being a menu+menuitem
    linkWidgetMoreMenu : null,
    linkWidgetMorePopup : null,

    aConsoleService: Components.classes["@mozilla.org/consoleservice;1"].
    getService(Components.interfaces.nsIConsoleService),
 
    lw_dump : function(msg) {
        msg = 'Link Widgets :: ' + msg;
        this.aConsoleService.logStringMessage(msg);
        dump(msg + "\n");
    },

    linkWidgetStartup : function() {
      LinkWidgetsExtension.lw_dump("linkWidgetStartup\n");
      window.removeEventListener("load", LinkWidgetsExtension.linkWidgetStartup, false);
      LinkWidgetsExtension.linkWidgetStrings = linkWidgetLoadStringBundle(LinkWidgetsExtension.linkWidgetStrings);
      for(var i in LinkWidgetsExtension._linkWidgetMenuOrdering) LinkWidgetsExtension.linkWidgetMenuOrdering[LinkWidgetsExtension._linkWidgetMenuOrdering[i]] = (i-0) + 1;
      for each(i in LinkWidgetsExtension._linkWidgetMenuRels) LinkWidgetsExtension.linkWidgetMenuRels[i] = true;
      for each(i in LinkWidgetsExtension._linkWidgetButtonRels) LinkWidgetsExtension.linkWidgetButtonRels[i] = true;
      LinkWidgetsExtension.linkWidgetInitMoreMenu();
      LinkWidgetsExtension.linkWidgetInitVisibleButtons();
      setTimeout(LinkWidgetsExtension.linkWidgetDelayedStartup, 1); // needs to happen after Fx's delayedStartup(); Fc?
    },

    linkWidgetDelayedStartup : function() {
      LinkWidgetsExtension.lw_dump("linkWidgetDelayedStartup");
      LinkWidgetsExtension.linkWidgetLoadPrefs();
//      dump("lw :: linkWidgetDelayedStartup | LinkWidgetsExtension.linkWidgetLoadPrefs\n");
      gPrefService.addObserver(LinkWidgetsExtension.linkWidgetPrefPrefix, LinkWidgetsExtension.linkWidgetPrefObserver, false);
//      dump("lw :: linkWidgetDelayedStartup : gPrefService.addObserver\n");
      for(var h in LinkWidgetsExtension.linkWidgetEventHandlers) {
//        LinkWidgetsExtension.lw_dump('linkWidgetDelayedStartup | ' + h);
//        LinkWidgetsExtension.lw_dump(LinkWidgetsExtension.linkWidgetEventHandlers[h]);
          gBrowser.addEventListener(h, window[LinkWidgetsExtension.linkWidgetEventHandlers[h]], false); // 3.6
          gBrowser.tabContainer.addEventListener(h, window[LinkWidgetsExtension.linkWidgetEventHandlers[h]], false); // 4.01+ -- ONLY some
      }

//          gBrowser.tabContainer.addEventListener('pagehide', LinkWidgetsExtension.linkWidgetPageHideHandler, false); // no
//        gBrowser.tabContainer.addEventListener('pageshow', LinkWidgetsExtension.linkWidgetPageShowHandler, false);
          gBrowser.tabContainer.addEventListener('select', LinkWidgetsExtension.linkWidgetTabSelectedHandler, false); // yes
//          gBrowser.tabContainer.addEventListener('DOMLinkAdded', LinkWidgetsExtension.linkWidgetLinkAddedHandler, false); // yes | no ?
//          gBrowser.tabContainer.addEventListener('DOMContentLoaded', LinkWidgetsExtension.linkWidgetPageLoadedHandler, false); // no


          gBrowser.addEventListener('pagehide', LinkWidgetsExtension.linkWidgetPageHideHandler, false); // yes
          gBrowser.addEventListener('pageshow', LinkWidgetsExtension.linkWidgetPageShowHandler, false); // yes
          gBrowser.addEventListener('DOMContentLoaded', LinkWidgetsExtension.linkWidgetPageLoadedHandler, false); // yes
          gBrowser.addEventListener('DOMLinkAdded', LinkWidgetsExtension.linkWidgetLinkAddedHandler, false); // also ?

//      dump("lw :: linkWidgetDelayedStartup : for(var h in LinkWidgetsExtension.linkWidgetEventHandlers)\n");
      // replace the toolbar customisation callback
        var box = document.getElementById("navigator-toolbox");
        box._preLinkWidget_customizeDone = box.customizeDone;
        box.customizeDone = LinkWidgetsExtension.linkWidgetToolboxCustomizeDone;
//      dump("lw :: linkWidgetDelayedStartup : box.customizeDone\n");
//      LinkWidgetsExtension.linkWidgetRefreshLinks(); // yyy - added
    },

    linkWidgetShutdown : function() {
      LinkWidgetsExtension.lw_dump("linkWidgetShutdown");
      window.removeEventListener("unload", LinkWidgetsExtension.linkWidgetShutdown, false);
      for(var h in LinkWidgetsExtension.linkWidgetEventHandlers) {
          gBrowser.addEventListener(h, window[LinkWidgetsExtension.linkWidgetEventHandlers[h]], false);
          gBrowser.tabContainer.addEventListener(h, window[LinkWidgetsExtension.linkWidgetEventHandlers[h]], false); // 4.01+ -- ONLY some
      }
      gPrefService.removeObserver(LinkWidgetsExtension.linkWidgetPrefPrefix, LinkWidgetsExtension.linkWidgetPrefObserver);
    },

    linkWidgetLoadPrefs : function() {
      LinkWidgetsExtension.lw_dump("linkWidgetLoadPrefs");
      const branch = Components.classes["@mozilla.org/preferences-service;1"]
                             .getService(Components.interfaces.nsIPrefService)
                             .QueryInterface(Components.interfaces.nsIPrefBranch)
                             .getBranch(LinkWidgetsExtension.linkWidgetPrefPrefix);
      //  const branch = gPrefService.getBranch(LinkWidgetsExtension.linkWidgetPrefPrefix);
      LinkWidgetsExtension.linkWidgetPrefScanHyperlinks = branch.getBoolPref("scanHyperlinks");
      LinkWidgetsExtension.linkWidgetPrefGuessUpAndTopFromURL = branch.getBoolPref("guessUpAndTopFromURL");
      LinkWidgetsExtension.linkWidgetPrefGuessPrevAndNextFromURL = branch.getBoolPref("guessPrevAndNextFromURL");
      // Isn't retrieving unicode strings from the pref service fun?
      const nsIStr = Components.interfaces.nsISupportsString;
      for(var prefname in LinkWidgetsExtension.linkWidgetRegexps) {
        var raw = branch.getComplexValue("regexp." + prefname, nsIStr).data;
        // RegExpr throws an exception if the string isn't a valid regexp pattern
        try {
          LinkWidgetsExtension.linkWidgetRegexps[prefname] = new RegExp(raw, "i");
        } catch(e) {
          Components.utils.reportError(e);
          // A regexp that can never match (since multiline flag not set)
          LinkWidgetsExtension.linkWidgetRegexps[prefname] = /$ /;
        }
      }
    },

    linkWidgetPrefObserver : {
      observe: function(subject, topic, data) {
    //    dump("lwpref: subject="+subject.root+" topic="+topic+" data="+data+"\n");
        // there're only three/four of them
        LinkWidgetsExtension.linkWidgetLoadPrefs();
      }
    },

    // Used to make the page scroll when the mouse-wheel is used on one of our buttons
    linkWidgetMouseScrollHandler : function(event) {
      content.scrollBy(0, event.detail);
    },

    linkWidgetInitMoreMenu : function() {
      LinkWidgetsExtension.linkWidgetMoreMenu = document.getElementById("linkwidget-more-menu");
      LinkWidgetsExtension.linkWidgetMorePopup = document.getElementById("linkwidget-more-popup");
    },

    linkWidgetInitVisibleButtons : function() {
      LinkWidgetsExtension.lw_dump("linkWidgetInitVisibleButtons");
      LinkWidgetsExtension.linkWidgetButtons = {};
      for(var rel in LinkWidgetsExtension.linkWidgetButtonRels) {
        var elt = document.getElementById("linkwidget-"+rel);
    //  dump("lw :: linkWidgetInitVisibleButtons | "+ rel +"\n");
        if(elt) LinkWidgetsExtension.linkWidgetButtons[rel] = initLinkWidgetButton(elt, rel);
      }
    },

    linkWidgetLinkAddedHandler : function(event) {
//
LinkWidgetsExtension.lw_dump('linkWidgetLinkAddedHandler');
      var elt = event.originalTarget;
      var doc = elt.ownerDocument;
      if(!(elt instanceof HTMLLinkElement) || !elt.href || !(elt.rel || elt.rev)) return;
      var rels = LinkWidgetsExtension.linkWidgetGetLinkRels(elt.rel, elt.rev, elt.type, elt.title);
LinkWidgetsExtension.lw_dump('linkWidgetLinkAddedHandler | rels = LinkWidgetsExtension.linkWidgetGetLinkRels(..)');
      if(rels) LinkWidgetsExtension.linkWidgetAddLinkForPage(elt.href, elt.title, elt.hreflang, elt.media, doc, rels);
    },

    // Really ought to delete/nullify doc.linkWidgetLinks on "close" (but not on "pagehide")
    linkWidgetPageHideHandler : function(event) {
//LinkWidgetsExtension.lw_dump('linkWidgetPageHideHandler');
      // Links like: <a href="..." onclick="this.style.display='none'">.....</a>
      // (the onclick handler could instead be on an ancestor of the link) lead to unload/pagehide
      // events with originalTarget==a text node.  So use ownerDocument (which is null for Documents)
      var doc = event.originalTarget;
      if(!(doc instanceof Document)) doc = doc.ownerDocument;
      // don't clear the links for unload/pagehide from a background tab, or from a subframe
      // If docShell is null accessing .contentDocument throws an exception
      if(!gBrowser.docShell || doc != gBrowser.contentDocument) return;
      for each(var btn in LinkWidgetsExtension.linkWidgetButtons) btn.show(null); // not a function [yet]
      if(LinkWidgetsExtension.linkWidgetMoreMenu) LinkWidgetsExtension.linkWidgetMoreMenu.disabled = true;
    },

    linkWidgetPageLoadedHandler : function(event) {
//LinkWidgetsExtension.lw_dump('linkWidgetPageLoadedHandler');
//      LinkWidgetsExtension.linkWidgetRefreshLinks();
      const doc = event.originalTarget, win = doc.defaultView;
      if(win != win.top || doc.linkWidgetHasGuessedLinks) return;
    
      doc.linkWidgetHasGuessedLinks = true;
      const links = doc.linkWidgetLinks || (doc.linkWidgetLinks = {});
      const isHTML = doc instanceof HTMLDocument && !(doc instanceof ImageDocument);
    
      if(LinkWidgetsExtension.linkWidgetPrefScanHyperlinks && isHTML) LinkWidgetsExtension.linkWidgetScanPageForLinks(doc);
    
      const loc = doc.location, protocol = loc.protocol;
      if(!/^(?:https?|ftp|file)\:$/.test(protocol)) return;
    
      if(LinkWidgetsExtension.linkWidgetPrefGuessPrevAndNextFromURL || !isHTML)
        LinkWidgetsExtension.guessPrevNextLinksFromURL(doc, !links.prev, !links.next);
    
      if(!LinkWidgetsExtension.linkWidgetPrefGuessUpAndTopFromURL && isHTML) return;
      if(!links.up) {
        var upUrl = LinkWidgetsExtension.guessUp(loc);
        if(upUrl) LinkWidgetsExtension.linkWidgetAddLinkForPage(upUrl, null, null, null, doc, {up: true});
      }
      if(!links.top) {
        var topUrl = protocol + "//" + loc.host + "/"
        LinkWidgetsExtension.linkWidgetAddLinkForPage(topUrl, null, null, null, doc, {top: true});
      }
    },

    linkWidgetTabSelectedHandler : function(event) {
//
      LinkWidgetsExtension.lw_dump('linkWidgetTabSelectedHandler');
    //  let newTab = event.originalTarget;
      if(event.originalTarget.localName != "tabs") return;
//dump('if(event.originalTarget.localName != "tabs") return' + "\n");
      LinkWidgetsExtension.linkWidgetRefreshLinks();
    },

    // xxx isn't this too keen to refresh?
    linkWidgetPageShowHandler : function(event) {
//LinkWidgetsExtension.lw_dump('linkWidgetPageShowHandler');
      const doc = event.originalTarget;
      // Link guessing for things with no DOMContentLoaded (e.g. ImageDocument)
      if(!doc.linkWidgetHasGuessedLinks) LinkWidgetsExtension.linkWidgetPageLoadedHandler(event);
      // If docShell is null accessing .contentDocument throws an exception
      if(!gBrowser.docShell || doc != gBrowser.contentDocument) return;
      LinkWidgetsExtension.linkWidgetRefreshLinks();
    },

    linkWidgetRefreshLinks : function() {
    //alert('lWRL'); LinkWidgetsExtension.lw_dump('linkWidgetRefreshLinks');
      for each(var btn in LinkWidgetsExtension.linkWidgetButtons) btn.show(null); // Error: btn.show is not a function
      if(LinkWidgetsExtension.linkWidgetMoreMenu) LinkWidgetsExtension.linkWidgetMoreMenu.disabled = true;
 //LinkWidgetsExtension.lw_dump('.');

      const doc = content.document, links = doc.linkWidgetLinks;
//LinkWidgetsExtension.lw_dump(typeof links);

      if(!links) return;
//LinkWidgetsExtension.lw_dump('if(!links)');
    
      var enableMoreMenu = false;
      for(var rel in links) {
//LinkWidgetsExtension.lw_dump('for(var rel in links)');
// Error: LinkWidgetsExtension.linkWidgetButtons[rel].show is not a function
        if(rel in LinkWidgetsExtension.linkWidgetButtons) LinkWidgetsExtension.linkWidgetButtons[rel].show(links[rel]); // ?
        else enableMoreMenu = true;
//enableMoreMenu = true;
      }
      if(LinkWidgetsExtension.linkWidgetMoreMenu && enableMoreMenu) LinkWidgetsExtension.linkWidgetMoreMenu.disabled = false;
    },

    linkWidgetAddLinkForPage : function(url, txt, lang, media, doc, rels) {
//
LinkWidgetsExtension.lw_dump('linkWidgetAddLinkForPage');
      const link = new LinkWidgetLink(url, txt, lang, media);
      // put the link in a rel->[link] map on the document's XPCNativeWrapper
      var doclinks = doc.linkWidgetLinks || (doc.linkWidgetLinks = {});
      for(var r in rels) {
        var rellinks = doclinks[r] || (doclinks[r] = []);
        var relurls = rellinks.urls || (rellinks.urls = {});
        // duplicate links are typically guessed links, and have inferior descriptions
        if(url in relurls) delete rels[r];
        else rellinks.push(link), relurls[url] = true;
      }

      if(doc != content.document) return;
      var enableMoreMenu = false;
      for(var rel in rels) {
        // buttons need updating immediately, but anything else can wait till the menu is showing
        if(rel in LinkWidgetsExtension.linkWidgetButtons) LinkWidgetsExtension.linkWidgetButtons[rel].show(doclinks[rel]);
        else enableMoreMenu = true;
      }
      if(LinkWidgetsExtension.linkWidgetMoreMenu && enableMoreMenu) LinkWidgetsExtension.linkWidgetMoreMenu.disabled = false;
    },

    linkWidgetOnMoreMenuShowing : function() {
LinkWidgetsExtension.lw_dump('linkWidgetOnMoreMenuShowing');
      const linkmaps = content.document.linkWidgetLinks;
      // Update all existing views
      for(var rel in LinkWidgetsExtension.linkWidgetViews) LinkWidgetsExtension.linkWidgetViews[rel].show(linkmaps[rel] || null);
      // Create any new views that are needed
      for(rel in linkmaps) {
LinkWidgetsExtension.lw_dump('linkWidgetOnMoreMenuShowing | ' + rel);
        if(rel in LinkWidgetsExtension.linkWidgetViews || rel in LinkWidgetsExtension.linkWidgetButtons) continue;
LinkWidgetsExtension.lw_dump('linkWidgetOnMoreMenuShowing | continue' + '');
        var relNum = LinkWidgetsExtension.linkWidgetMenuOrdering[rel] || Infinity;
        var isMenu = rel in LinkWidgetsExtension.linkWidgetMenuRels;
        var item = LinkWidgetsExtension.linkWidgetViews[rel] =
          isMenu ? new LinkWidgetMenu(rel, relNum) : new LinkWidgetItem(rel, relNum);
        item.show(linkmaps[rel]);
LinkWidgetsExtension.lw_dump('linkWidgetOnMoreMenuShowing | ' + isMenu);
      }
    },

    linkWidgetToolboxCustomizeDone : function(somethingChanged) {
      this._preLinkWidget_customizeDone(somethingChanged);
      if(!somethingChanged) return;
    
      LinkWidgetsExtension.linkWidgetInitMoreMenu();
      for each(var btn in LinkWidgetsExtension.linkWidgetButtons) btn.show(null); // Error: btn.show is not a function
      LinkWidgetsExtension.linkWidgetInitVisibleButtons();
      for(var rel in LinkWidgetsExtension.linkWidgetViews) {
        var item = LinkWidgetsExtension.linkWidgetViews[rel];
        if(!LinkWidgetsExtension.linkWidgetButtons[rel] && LinkWidgetsExtension.linkWidgetMoreMenu) continue;
        item.destroy();
        delete LinkWidgetsExtension.linkWidgetViews[rel];
      }
      // Can end up incorrectly enabled if e.g. only the Top menuitem was active,
      // and that gets replaced by a button.
      if(LinkWidgetsExtension.linkWidgetMoreMenu) LinkWidgetsExtension.linkWidgetMoreMenu.disabled = true;
    
      LinkWidgetsExtension.linkWidgetRefreshLinks();
    },

    linkWidgetMouseEnter : function(e) {
      const t = e.target;
      XULBrowserWindow.setOverLink(t.linkURL || "", null);
    },

    linkWidgetMouseExit : function(e) {
      const t = e.target;
      XULBrowserWindow.setOverLink("", null);
    },

    linkWidgetFillTooltip : function(tooltip, event) {
      const elt = document.tooltipNode, line1 = tooltip.firstChild, line2 = tooltip.lastChild;
      const text1 = elt.preferredTooltipText || elt.getAttribute("fallbackTooltipText");
      const text2 = elt.linkURL;
      line1.hidden = !(line1.value = text1);
      line2.hidden = !(line2.value = text2);
      // don't show the tooltip if it's over a submenu of the More menu
      return !(!text1 && !text2); // return a bool, not a string; [OR] == NAND ( !A !B )
    },

    linkWidgetItemClicked : function(e) {
      if(e.button != 1) return;
      LinkWidgetsExtension.linkWidgetLoadPage(e);
      // close any menus
      var p = e.target;
      while(p.localName!="toolbarbutton") {
        if(p.localName=="menupopup") p.hidePopup();
        p = p.parentNode;
      }
    },

    linkWidgetButtonRightClicked : function(e) {
      const t = e.target, ot = e.originalTarget;
      if(ot.localName=="toolbarbutton" && t.numLinks > 1) t.firstChild.showPopup();
    },

    linkWidgetLoadPage : function(e) {
      const url = e.target.linkURL;
      const sourceURL = content.document.documentURI; // ?
      const button = e.type=="command" ? 0 : e.button;
      // Make handleLinkClick find the right origin URL
     // const fakeEvent = { target: { ownerDocument: { location : { href: sourceURL }}}, // Fx 3.5 revert required ?
      const fakeEvent = { target: { ownerDocument: content.document },
          button: button, __proto__: e }; // proto must be set last
      // handleLinkClick deals with modified left-clicks, and middle-clicks
      if(typeof handleLinkClick == 'function') {
       const didHandleClick = handleLinkClick(fakeEvent, url, null);
       if(didHandleClick || button != 0) return;
      }
      LinkWidgetsExtension.linkWidgetLoadPageInCurrentBrowser(url);
    },

    linkWidgetGo : function(rel) {
      const links = content.document.linkWidgetLinks || {};
      if(!links[rel]) return;
      LinkWidgetsExtension.linkWidgetLoadPageInCurrentBrowser(links[rel][0].url);
    },

    linkWidgetLoadPageInCurrentBrowser : function(url) {
      // urlSecurityCheck wanted a URL-as-string for Fx 2.0, but an nsIPrincipal on trunk
    
        if(gBrowser.contentPrincipal) urlSecurityCheck(url, gBrowser.contentPrincipal);
        else urlSecurityCheck(url, content.document.documentURI);
        gBrowser.loadURI(url);
    
      content.focus();
    },

    // arg is an nsIDOMLocation, with protocol of http(s) or ftp
    guessUp : function (location) {
        const ignoreRE = LinkWidgetsExtension.linkWidgetRegexps.guess_up_skip;
        const prefix = location.protocol + "//";
        var host = location.host, path = location.pathname, path0 = path, matches, tail;
        if(location.search && location.search!="?") return prefix + host + path;
        if(path[path.length - 1] == "/") path = path.slice(0, path.length - 1);
        // dig through path
        while(path) {
          matches = path.match(/^(.*)\/([^\/]*)$/);
          if(!matches) break;
          path = matches[1];
          tail = matches[2];
          if(path ? !ignoreRE.test(tail) : path0 != "/" && !ignoreRE.test(path0))
            return prefix + location.host + path + "/";
        }
        // dig through subdomains
        matches = host.match(/[^.]*\.(.*)/);
        return matches && /\./.test(matches[1]) ? prefix + matches[1] + "/" : null;
    },

    // null values mean that rel should be ignored
    linkWidgetRelConversions : {
      home: "top",
      origin: "top",
      start: "top",
      parent: "up",
      begin: "first",
      child: "next",
      previous: "prev",
      end: "last",
      contents: "toc",
      nofollow: null, // blog thing
      external: null, // used to mean "off-site link", mostly used for styling
      prefetch: null,
      sidebar: null
    },

    linkWidgetRevToRel : {
      made: "author",
      next: "prev",
      prev: "next",
      previous: "next"
    },

    linkWidgetGetLinkRels : function (relStr, revStr, mimetype, title) {
LinkWidgetsExtension.lw_dump('LinkWidgetsExtension.linkWidgetGetLinkRels');
  // Ignore certain links
  if(LinkWidgetsExtension.linkWidgetRegexps.ignore_rels.test(relStr)) return null;
  // Ignore anything Firefox regards as an RSS/Atom-feed link
  if(relStr && /alternate/i.test(relStr)) {
    // xxx have seen JS errors where "mimetype has no properties" (i.e., is null)
    if(mimetype) { const type = mimetype.replace(/\s|;.*/g, "").toLowerCase(); }
    const feedtype = /^application\/(?:rss|atom)\+xml$/;
    const xmltype = /^(?:application|text)\/(?:rdf\+)?xml$/;
    if(feedtype.test(type) || (xmltype.test(type) && /\brss\b/i.test(title))) return null;
  }

  const whitespace = /[ \t\f\r\n\u200B]+/; // per HTML4.01 spec
  const rels = {};
  var haveRels = false;
  if(relStr) {
    var relValues = relStr.split(whitespace);
    for(var i = 0; i != relValues.length; i++) {
      var rel = relValues[i].toLowerCase();
      // this has to use "in", because the entries can be null (meaning "ignore")
      rel = rel in LinkWidgetsExtension.linkWidgetRelConversions ? LinkWidgetsExtension.linkWidgetRelConversions[rel] : rel;
      if(rel) rels[rel] = true, haveRels = true;
    }
  }
  if(revStr) {
    var revValues = revStr.split(whitespace);
    for(i = 0; i < revValues.length; i++) {
      rel = linkWidgetRevToRel[revValues[i].toLowerCase()] || null;
      if(rel) rels[rel] = true, haveRels = true;
    }
  }
  return haveRels ? rels : null;
},

linkWidgetLoadStringBundle : function (bundlePath) {
  const strings = {};
  try {
    var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                 .getService(Components.interfaces.nsIStringBundleService)
                 .createBundle(bundlePath)
                 .getSimpleEnumeration();
  } catch(ex) {
    return {};  // callers can all survive without
  }

  while(bundle.hasMoreElements()) {
    var item = bundle.getNext().QueryInterface(Components.interfaces.nsIPropertyElement);
    strings[item.key] = item.value;
  }

  return strings;
},

// a map from 2/3-letter lang codes to the langs' names in the current locale
linkWidgetLanguageNames : null,

// code is a language code, e.g. en, en-GB, es, fr-FR
linkWidgetGetLanguageName : function (code) {
    if(!linkWidgetLanguageNames) LinkWidgetsExtension.linkWidgetLanguageNames =
      LinkWidgetsExtension.linkWidgetLoadStringBundle("chrome://global/locale/languageNames.properties");
    const dict = LinkWidgetsExtension.linkWidgetLanguageNames;
    if(code in dict) return dict[code];
    // if we have something like "en-GB", change to "English (GB)"
    var parts = code.match(/^(.{2,3})-(.*)$/);
    // xxx make the parentheses localizable
    if(parts && parts[1] in dict) return dict[parts[1]]+" ("+parts[2]+")";
    return code;
},

linkWidgetScanPageForLinks : function (doc) {
LinkWidgetsExtension.lw_dump('Scan');
  const links = doc.links;
  // The scanning blocks the UI, so we don't want to spend too long on it. Previously we'd block the
  // UI for several seconds on http://antwrp.gsfc.nasa.gov/apod/archivepix.html (>3000 links)
  const max = Math.min(links.length, 500);

  for(var i = 0; i != max; ++i) {
    var link = links[i], href = link.href;
    if(!href || href.charAt(0)=='#') continue; // ignore internal links

    var txt = link.innerHTML
        .replace(/<[^>]+alt=(["'])(.*?)\1[^>]*>/ig, " $2 ") // keep alt attrs
        .replace(/<[^>]*>/g, "") // drop tags + comments
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "");
    var rels = (link.rel || link.rev) && LinkWidgetsExtension.linkWidgetGetLinkRels(link.rel, link.rev);
    if(!rels) {
      var rel = LinkWidgetsExtension.guessLinkRel(link, txt);
      if(rel) rels = {}, rels[rel] = true;
    }
    if(rels) LinkWidgetsExtension.linkWidgetAddLinkForPage(href, txt, link.hreflang, null, doc, rels);
  }
},

// link is an <a href> link
guessLinkRel : function (link, txt) {
LinkWidgetsExtension.lw_dump('guessLinkRel');
  if(LinkWidgetsExtension.linkWidgetRegexps.next.test(txt)) return "next";
  if(LinkWidgetsExtension.linkWidgetRegexps.prev.test(txt)) return "prev";
  if(LinkWidgetsExtension.linkWidgetRegexps.first.test(txt)) return "first";
  if(LinkWidgetsExtension.linkWidgetRegexps.last.test(txt)) return "last";
  const imgs = link.getElementsByTagName("img"), num = imgs.length;
  for(var i = 0; i != num; ++i) {
    // guessing is more accurate on relative URLs, and .src is always absolute
    var src = imgs[i].getAttribute("src");
    if(LinkWidgetsExtension.linkWidgetRegexps.img_next.test(src)) return "next";
    if(LinkWidgetsExtension.linkWidgetRegexps.img_prev.test(src)) return "prev";
    if(LinkWidgetsExtension.linkWidgetRegexps.img_first.test(src)) return "first";
    if(LinkWidgetsExtension.linkWidgetRegexps.img_last.test(src)) return "last";
  }
  return null;
},

guessPrevNextLinksFromURL : function (doc, guessPrev, guessNext) {
    if(!guessPrev && !guessNext) return;

    function isDigit(c) { return ("0" <= c && c <= "9") }

    const location = doc.location;
    var url = location.href;
    var min = location.host.length + location.protocol.length + 2; // 2 for "//"

    var e, s;
    for(e = url.length; e > min && !isDigit(url[e-1]); --e);
    if(e==min) return;
    for(s = e - 1; s > min && isDigit(url[s-1]); --s);
    // avoid guessing "foo%21bar" as next from "foo%20bar" (i.e. "foo bar")
    if(s && url[s-1] == "%") return;

    var old = url.substring(s,e);
    var num = parseInt(old, 10); // force base 10 because number could start with zeros

    var pre = url.substring(0,s), post = url.substring(e);
    if(guessPrev) {
      var prv = ""+(num-1);
      while(prv.length < old.length) prv = "0" + prv;
      LinkWidgetsExtension.linkWidgetAddLinkForPage(pre + prv + post, null, null, null, doc, { prev: true });
    }
    if(guessNext) {
      var nxt = ""+(num+1);
      while(nxt.length < old.length) nxt = "0" + nxt;
      LinkWidgetsExtension.linkWidgetAddLinkForPage(pre + nxt + post, null, null, null, doc, { next: true });
    }
}


};

window.addEventListener("load", LinkWidgetsExtension.linkWidgetStartup, false);
window.addEventListener("unload", LinkWidgetsExtension.linkWidgetShutdown, false);


/*
// a map from 2/3-letter lang codes to the langs' names in the current locale
var linkWidgetLanguageNames = null;

// code is a language code, e.g. en, en-GB, es, fr-FR
function linkWidgetGetLanguageName(code) {
    if(!linkWidgetLanguageNames) linkWidgetLanguageNames =
      linkWidgetLoadStringBundle("chrome://global/locale/languageNames.properties");
    const dict = linkWidgetLanguageNames;
    if(code in dict) return dict[code];
    // if we have something like "en-GB", change to "English (GB)"
    var parts = code.match(/^(.{2,3})-(.*)$/);
    // xxx make the parentheses localizable
    if(parts && parts[1] in dict) return dict[parts[1]]+" ("+parts[2]+")";
    return code;
}


function linkWidgetLoadStringBundle(bundlePath) {
  const strings = {};
  try {
    var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                 .getService(Components.interfaces.nsIStringBundleService)
                 .createBundle(bundlePath)
                 .getSimpleEnumeration();
  } catch(ex) {
    return {};  // callers can all survive without
  }

  while(bundle.hasMoreElements()) {
    var item = bundle.getNext().QueryInterface(Components.interfaces.nsIPropertyElement);
    strings[item.key] = item.value;
  }

  return strings;
}
*/

function LinkWidgetLink(url, title, lang, media) {
  this.url = url;
  this.title = title || null;
  this.lang = lang || null;
  this.media = media || null;
}
LinkWidgetLink.prototype = {
  _longTitle: null,

  // this is only needed when showing a tooltip, or for items on the More menu, so we
  // often won't use it at all, hence using a getter function
  get longTitle() {
    if(!this._longTitle) {
      var longTitle = "";
      // XXX: lookup more meaningful and localized version of media,
      //   i.e. media="print" becomes "Printable" or some such
      // XXX: use localized version of ":" separator
      if(this.media && !/\b(all|screen)\b/i.test(this.media)) longTitle += this.media + ": ";
      // XXX this produces stupid results if there is an hreflang present but no title
      // (gives "French: ", should be something like "French [language] version")
      if(this.lang) longTitle += LinkWidgetsExtension.linkWidgetGetLanguageName(this.lang) + ": ";
      if(this.title) longTitle += this.title;
      // the 'if' here is to ensure the long title isn't just the url
      else if(longTitle) longTitle += this.url;
      this._longTitle = longTitle;
    }
    return this._longTitle;
  }
};


const linkWidgetItemBase = {
  popup: null,

  buildMenu: function() {
    const p = this.popup;
    while(p.hasChildNodes()) p.removeChild(p.lastChild);
    // this code won't be running unless the doc has links for this rel
    const links = content.document.linkWidgetLinks[this.rel], num = links.length;
    for(var i = 0; i != num; i++) {
      var l = links[i];
      var href = l.url, label = l.longTitle || l.url, tooltip = l.title;
      var mi = document.createElement("menuitem");
      mi.className = "menuitem-iconic linkwidget-menuitem";
      mi.linkURL = href;
      mi.setAttribute("label", label);
      mi.preferredTooltipText = tooltip;
      p.appendChild(mi);
    }
  }
};


// Top, Up, First, Prev, Next, and Last menu-buttons
// Hackery employed to disable the dropmarker if there is just one link.
function initLinkWidgetButton(elt, rel) {
  if(elt.alreadyInitialised) return elt;
  elt.alreadyInitialised = true;
  elt.rel = rel;
  // to avoid repetitive XUL
  elt.onmouseover = LinkWidgetsExtension.linkWidgetMouseEnter;
  elt.onmouseout = LinkWidgetsExtension.linkWidgetMouseExit;
  elt.onclick = LinkWidgetsExtension.linkWidgetItemClicked;
  elt.oncontextmenu = LinkWidgetsExtension.linkWidgetButtonRightClicked;
  elt.setAttribute("oncommand", "LinkWidgetsExtension.linkWidgetLoadPage(event);"); // .oncommand does not exist
  elt.setAttribute("context", "");
  elt.setAttribute("tooltip", "linkwidget-tooltip");

  elt.addEventListener("DOMMouseScroll", LinkWidgetsExtension.linkWidgetMouseScrollHandler, false);

  for(var i in linkWidgetButton) elt[i] = linkWidgetButton[i]; // reference following const
  var popup = elt.popup = document.createElement("menupopup");
  elt.appendChild(popup);
  popup.setAttribute("onpopupshowing", "return this.parentNode.buildMenu();");
  // hackish
  var anonKids = document.getAnonymousNodes(elt);
  elt.dropMarker = anonKids[anonKids.length-1];
  return elt;
};

const linkWidgetButton = {
  __proto__: linkWidgetItemBase,
  numLinks: 0,

//  init: function(elt, rel) {} // ?

  show: function(links) {
    const numLinks = this.numLinks = links ? links.length : 0
    this.disabled = !numLinks;
    if(!numLinks) {
      this.linkURL = null;
      this.preferredTooltipText = null;
      this.removeAttribute("multi");
      return;
    }
    const link = links[0];
    // xxx this sets these attributes every time a link is added to the current doc
    this.linkURL = link.url;
    this.preferredTooltipText = link.longTitle;
    if(numLinks == 1) {
      // just setting .disabled will not do anything, presumably because the
      // dropmarker xbl:inherits the toolbarbutton's disabled attribute.
      this.dropMarker.setAttribute("disabled","true");
    } else {
      this.dropMarker.removeAttribute("disabled");
      this.setAttribute("multi", "true");
    }
  }
};


// switches automatically between being a single menu item and a whole sub menu
function LinkWidgetItem(rel, relNum) {
  this.rel = rel;
  this.relNum = relNum
}
LinkWidgetItem.prototype = {
  __proto__: linkWidgetItemBase,

  menuitem: null,
  menu: null,
  popup: null,

  destroy: function() {
    const i = this.menuitem, m = this.menu, p = this.popup;
    if(!i) return;
    delete i.linkWidgetItem; i.parentNode.removeChild(i);
    delete m.linkWidgetItem; m.parentNode.removeChild(m);
    delete p.linkWidgetItem;
    this.menuitem = this.menu = this.popup = null;
  },

  show: function(links) {
    const numLinks = links ? links.length : 0;
    
    if(!this.menuitem) {
      if(!numLinks) return;
      this.createElements();
    }
    const mi = this.menuitem, m = this.menu;
    switch(numLinks) {
    case 0:
      mi.hidden = true;
      m.hidden = true;
      break;
    case 1:
      const link = links[0];
      m.hidden = true;
      mi.linkURL = link.url;
      mi.hidden = false;
      mi.preferredTooltipText = link.longTitle;
      break;
    default:
      mi.hidden = true;
      m.hidden = false;
    }
  },

  createElements: function() {
    const rel = this.rel;
    const mi = this.menuitem = document.createElement("menuitem");
    const relStr = LinkWidgetsExtension.linkWidgetStrings[rel] || rel;
    const relclass = LinkWidgetsExtension.linkWidgetButtonRels[rel] ? " linkwidget-rel-"+rel : "";
    mi.className = "menuitem-iconic linkwidget-menuitem " + relclass;
    mi.setAttribute("label", relStr);
    const m = this.menu = document.createElement("menu");
    m.setAttribute("label", LinkWidgetsExtension.linkWidgetStrings["2"+rel] || relStr);
    m.hidden = true;
    m.className = "menu-iconic linkwidget-menu" + relclass;
    const p = this.popup = document.createElement("menupopup");
    p.setAttribute("onpopupshowing", "this.linkWidgetItem.buildMenu();");

    mi.linkWidgetItem = m.linkWidgetItem = p.linkWidgetItem = this;
    mi.relNum = m.relNum = this.relNum;
    m.appendChild(p);
    
    const mpopup = LinkWidgetsExtension.linkWidgetMorePopup, kids = mpopup.childNodes, num = kids.length;
    var insertionpoint = null;
    if(this.relNum != Infinity && num != 0) {
      for(var i = 0, node = kids[i]; i < num && node.relNum < this.relNum; i += 2, node = kids[i]);
      if(i != num) insertionpoint = node;
    }
    if(insertionpoint) {
      mpopup.insertBefore(m, insertionpoint);
      mpopup.insertBefore(mi, insertionpoint);
    } else {
      mpopup.appendChild(m);
      mpopup.appendChild(mi);
    }
  }
};


// an item that's always a submenu (e.g. Chapters)
function LinkWidgetMenu(rel, relNum) {
  this.rel = rel;
  this.relNum = relNum;
}
LinkWidgetMenu.prototype = {
  __proto__: LinkWidgetItem.prototype,

  show: function(links) {
    const numLinks = links ? links.length : 0;
    if(!this.menuitem) {
      if(!numLinks) return;
      this.createElements();
      this.menuitem.hidden = true; // we never use it
    }
    this.menu.hidden = numLinks == 0;
  }
};
