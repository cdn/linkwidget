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

var LinkWidgetCore = {

    prefPrefix : "extensions.linkwidget.",

    // Used in link-guessing. Populated from preferences with related names.
    regexps : {
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
    menuRels : {}, // rel -> true map
    _menuRels : ["chapter", "section", "subsection", "bookmark", "alternate"],
    
    // known rels in the order they should appear on the More menu
    menuOrdering : {}, // rel -> int map
    _menuOrdering : [
      "top","up","first","prev","next","last","toc","chapter","section","subsection","appendix",
      "glossary","index","help","search","author","copyright","bookmark","alternate"
    ],

    buttonRels : {}, // rel -> true map
    _buttonRels : ["top","up","first","prev","next","last"],
    
    eventHandlers : {
      "select": "LinkWidgetCore.tabSelectedHandler",
      "DOMLinkAdded": "LinkWidgetCore.linkAddedHandler",
      "pagehide": "LinkWidgetCore.pageHideHandler",
      "DOMContentLoaded": "LinkWidgetCore.pageLoadedHandler",
      "pageshow": "LinkWidgetCore.pageShowHandler"
    },

    prefGuessUpAndTopFromURL : false,
    prefGuessPrevAndNextFromURL : false,
    prefScanHyperlinks : false,
    strings : "chrome://linkwidget/locale/main.strings",
    buttons : {}, // rel -> <toolbarbutton> map
    views : {},   // rel -> view map, the views typically being a menu+menuitem
    moreMenu : null,
    morePopup : null,

    aConsoleService: Components.classes["@mozilla.org/consoleservice;1"].
    getService(Components.interfaces.nsIConsoleService),
 
    lw_dump : function(msg) {
        msg = 'Link Widgets :: ' + msg;
       // this.aConsoleService.logStringMessage(msg);
        dump(msg + "\n");
    },

    startup : function() {
      LinkWidgetCore.lw_dump("startup\n");
      window.removeEventListener("load", LinkWidgetCore.startup, false);
      LinkWidgetCore.strings = LinkWidgetCore.loadStringBundle(LinkWidgetCore.strings);
      for(var i in LinkWidgetCore._menuOrdering) LinkWidgetCore.menuOrdering[LinkWidgetCore._menuOrdering[i]] = (i-0) + 1;
      for each(i in LinkWidgetCore._menuRels) LinkWidgetCore.menuRels[i] = true;
      for each(i in LinkWidgetCore._buttonRels) LinkWidgetCore.buttonRels[i] = true;
      LinkWidgetCore.initMoreMenu();
      LinkWidgetCore.initVisibleButtons();
      setTimeout(LinkWidgetCore.delayedStartup, 1); // needs to happen after Fx's delayedStartup(); Fc?
    },

    delayedStartup : function() {
      LinkWidgetCore.lw_dump("delayedStartup");
      LinkWidgetCore.loadPrefs();
//      dump("lw :: delayedStartup | LinkWidgetCore.loadPrefs\n");
      gPrefService.addObserver(LinkWidgetCore.prefPrefix, LinkWidgetCore.prefObserver, false);
      for(var h in LinkWidgetCore.eventHandlers) {
//
        LinkWidgetCore.lw_dump(LinkWidgetCore.eventHandlers[h]);
          gBrowser.addEventListener(h, window[LinkWidgetCore.eventHandlers[h]], false); // 3.6
          gBrowser.tabContainer.addEventListener(h, window[LinkWidgetCore.eventHandlers[h]], false); // 4.01+ -- ONLY some
      }

//        gBrowser.tabContainer.addEventListener('pageshow', LinkWidgetCore.pageShowHandler, false);
          gBrowser.tabContainer.addEventListener('select', LinkWidgetCore.tabSelectedHandler, false); // yes

//          gBrowser.tabContainer.addEventListener('DOMLinkAdded', LinkWidgetCore.linkAddedHandler, false); // yes | no ?

          gBrowser.addEventListener('pagehide', LinkWidgetCore.pageHideHandler, false); // yes
          gBrowser.addEventListener('pageshow', LinkWidgetCore.pageShowHandler, false); // yes
          gBrowser.addEventListener('DOMContentLoaded', LinkWidgetCore.pageLoadedHandler, false); // yes
          gBrowser.addEventListener('DOMLinkAdded', LinkWidgetCore.linkAddedHandler, false); // also ?

      // replace the toolbar customisation callback
        var box = document.getElementById("navigator-toolbox");
        box._preLinkWidget_customizeDone = box.customizeDone;
        box.customizeDone = LinkWidgetCore.toolboxCustomizeDone;
    },

    shutdown : function() {
//      LinkWidgetCore.lw_dump("shutdown");
      window.removeEventListener("unload", LinkWidgetCore.shutdown, false);
      for(var h in LinkWidgetCore.eventHandlers) {
          gBrowser.removeEventListener(h, window[LinkWidgetCore.eventHandlers[h]], false);
          gBrowser.tabContainer.removeEventListener(h, window[LinkWidgetCore.eventHandlers[h]], false); // 4.01+ -- ONLY some
      }
      gPrefService.removeObserver(LinkWidgetCore.prefPrefix, LinkWidgetCore.prefObserver);
    },

    loadPrefs : function() {
      LinkWidgetCore.lw_dump("loadPrefs");
      const branch = Components.classes["@mozilla.org/preferences-service;1"]
                             .getService(Components.interfaces.nsIPrefService)
                             .QueryInterface(Components.interfaces.nsIPrefBranch)
                             .getBranch(LinkWidgetCore.prefPrefix);
      //  const branch = gPrefService.getBranch(LinkWidgetCore.prefPrefix);
      LinkWidgetCore.prefScanHyperlinks = branch.getBoolPref("scanHyperlinks");
      LinkWidgetCore.prefGuessUpAndTopFromURL = branch.getBoolPref("guessUpAndTopFromURL");
      LinkWidgetCore.prefGuessPrevAndNextFromURL = branch.getBoolPref("guessPrevAndNextFromURL");
      // Isn't retrieving unicode strings from the pref service fun?
      const nsIStr = Components.interfaces.nsISupportsString;
      for(var prefname in LinkWidgetCore.regexps) {
        var raw = branch.getComplexValue("regexp." + prefname, nsIStr).data;
        // RegExpr throws an exception if the string isn't a valid regexp pattern
        try {
          LinkWidgetCore.regexps[prefname] = new RegExp(raw, "i");
        } catch(e) {
          Components.utils.reportError(e);
          // A regexp that can never match (since multiline flag not set)
          LinkWidgetCore.regexps[prefname] = /$ /;
        }
      }
    },

    prefObserver : {
      observe: function(subject, topic, data) {
    //    dump("lwpref: subject="+subject.root+" topic="+topic+" data="+data+"\n");
        // there're only three/four of them
        LinkWidgetCore.loadPrefs();
      }
    },

    // Used to make the page scroll when the mouse-wheel is used on one of our buttons
    mouseScrollHandler : function(event) {
      content.scrollBy(0, event.detail);
    },

    initMoreMenu : function() {
      LinkWidgetCore.moreMenu = document.getElementById("linkwidget-more-menu");
      LinkWidgetCore.morePopup = document.getElementById("linkwidget-more-popup");
    },

    initVisibleButtons : function() {
      LinkWidgetCore.lw_dump("initVisibleButtons");
      LinkWidgetCore.buttons = {};
      for(var rel in LinkWidgetCore.buttonRels) {
        var elt = document.getElementById("linkwidget-"+rel);
        if(elt) LinkWidgetCore.buttons[rel] = initLinkWidgetButton(elt, rel);
      }
    },

    linkAddedHandler : function(event) {
//LinkWidgetCore.lw_dump('linkAddedHandler');
      var elt = event.originalTarget;
      var doc = elt.ownerDocument;
      if(!(elt instanceof HTMLLinkElement) || !elt.href || !(elt.rel || elt.rev)) return;
      var rels = LinkWidgetCore.getLinkRels(elt.rel, elt.rev, elt.type, elt.title);
      if(rels) LinkWidgetCore.addLinkForPage(elt.href, elt.title, elt.hreflang, elt.media, doc, rels);
    },

    // Really ought to delete/nullify doc.linkWidgetLinks on "close" (but not on "pagehide")
    pageHideHandler : function(event) {
//LinkWidgetCore.lw_dump('pageHideHandler');
      // Links like: <a href="..." onclick="this.style.display='none'">.....</a>
      // (the onclick handler could instead be on an ancestor of the link) lead to unload/pagehide
      // events with originalTarget==a text node.  So use ownerDocument (which is null for Documents)
      var doc = event.originalTarget;
      if(!(doc instanceof Document)) doc = doc.ownerDocument;
      // don't clear the links for unload/pagehide from a background tab, or from a subframe
      // If docShell is null accessing .contentDocument throws an exception
      if(!gBrowser.docShell || doc != gBrowser.contentDocument) return;
      for each(var btn in LinkWidgetCore.buttons) btn.show(null);
      if(LinkWidgetCore.moreMenu) LinkWidgetCore.moreMenu.disabled = true;
    },

    pageLoadedHandler : function(event) {
//LinkWidgetCore.lw_dump('pageLoadedHandler');
      const doc = event.originalTarget, win = doc.defaultView;
      if(win != win.top || doc.linkWidgetHasGuessedLinks) return;
    
      doc.linkWidgetHasGuessedLinks = true;
      const links = doc.linkWidgetLinks || (doc.linkWidgetLinks = {});
      const isHTML = doc instanceof HTMLDocument && !(doc instanceof ImageDocument);
    
      if(LinkWidgetCore.prefScanHyperlinks && isHTML) LinkWidgetCore.scanPageForLinks(doc);
    
      const loc = doc.location, protocol = loc.protocol;
      if(!/^(?:https?|ftp|file)\:$/.test(protocol)) return;
    
      if(LinkWidgetCore.prefGuessPrevAndNextFromURL || !isHTML)
        LinkWidgetCore.guessPrevNextLinksFromURL(doc, !links.prev, !links.next);
    
      if(!LinkWidgetCore.prefGuessUpAndTopFromURL && isHTML) return;
      if(!links.up) {
        var upUrl = LinkWidgetCore.guessUp(loc);
        if(upUrl) LinkWidgetCore.addLinkForPage(upUrl, null, null, null, doc, {up: true});
      }
      if(!links.top) {
        var topUrl = protocol + "//" + loc.host + "/"
        LinkWidgetCore.addLinkForPage(topUrl, null, null, null, doc, {top: true});
      }
    },

    tabSelectedHandler : function(event) {
//
      LinkWidgetCore.lw_dump('tabSelectedHandler');
    //  let newTab = event.originalTarget;
      if(event.originalTarget.localName != "tabs") return;
      LinkWidgetCore.refreshLinks();
    },

    // xxx isn't this too keen to refresh?
    pageShowHandler : function(event) {
//LinkWidgetCore.lw_dump('pageShowHandler');
      const doc = event.originalTarget;
      // Link guessing for things with no DOMContentLoaded (e.g. ImageDocument)
      if(!doc.linkWidgetHasGuessedLinks) LinkWidgetCore.pageLoadedHandler(event);
      // If docShell is null accessing .contentDocument throws an exception
      if(!gBrowser.docShell || doc != gBrowser.contentDocument) return;
      LinkWidgetCore.refreshLinks();
    },

    refreshLinks : function() {
    //alert('lWRL'); LinkWidgetCore.lw_dump('refreshLinks');
      for each(var btn in LinkWidgetCore.buttons) btn.show(null);
      if(LinkWidgetCore.moreMenu) LinkWidgetCore.moreMenu.disabled = true;

      const doc = content.document, links = doc.linkWidgetLinks;

      if(!links) return;
    
      var enableMoreMenu = false;
      for(var rel in links) {
        if(rel in LinkWidgetCore.buttons) LinkWidgetCore.buttons[rel].show(links[rel]); // ?
        else enableMoreMenu = true;
      }
      if(LinkWidgetCore.moreMenu && enableMoreMenu) LinkWidgetCore.moreMenu.disabled = false;
    },

    addLinkForPage : function(url, txt, lang, media, doc, rels) {
//
LinkWidgetCore.lw_dump('addLinkForPage');
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
        if(rel in LinkWidgetCore.buttons) LinkWidgetCore.buttons[rel].show(doclinks[rel]);
        else enableMoreMenu = true;
      }
      if(LinkWidgetCore.moreMenu && enableMoreMenu) LinkWidgetCore.moreMenu.disabled = false;
    },

    onMoreMenuShowing : function() {
LinkWidgetCore.lw_dump('onMoreMenuShowing');
      const linkmaps = content.document.linkWidgetLinks;
      // Update all existing views
      for(var rel in LinkWidgetCore.views) LinkWidgetCore.views[rel].show(linkmaps[rel] || null);
      // Create any new views that are needed
      for(rel in linkmaps) {
        if(rel in LinkWidgetCore.views || rel in LinkWidgetCore.buttons) continue;
        var relNum = LinkWidgetCore.menuOrdering[rel] || Infinity;
        var isMenu = rel in LinkWidgetCore.menuRels;
        var item = LinkWidgetCore.views[rel] =
          isMenu ? new LinkWidgetMenu(rel, relNum) : new LinkWidgetItem(rel, relNum);
        item.show(linkmaps[rel]);
      }
    },

    toolboxCustomizeDone : function(somethingChanged) {
      this._preLinkWidget_customizeDone(somethingChanged);
      if(!somethingChanged) return;
    
      LinkWidgetCore.initMoreMenu();
      for each(var btn in LinkWidgetCore.buttons) btn.show(null);
      LinkWidgetCore.initVisibleButtons();
      for(var rel in LinkWidgetCore.views) {
        var item = LinkWidgetCore.views[rel];
        if(!LinkWidgetCore.buttons[rel] && LinkWidgetCore.moreMenu) continue;
        item.destroy();
        delete LinkWidgetCore.views[rel];
      }
      // Can end up incorrectly enabled if e.g. only the Top menuitem was active,
      // and that gets replaced by a button.
      if(LinkWidgetCore.moreMenu) LinkWidgetCore.moreMenu.disabled = true;
    
      LinkWidgetCore.refreshLinks();
    },

    mouseEnter : function(e) {
      const t = e.target;
      XULBrowserWindow.setOverLink(t.linkURL || "", null);
    },

    mouseExit : function(e) {
      const t = e.target;
      XULBrowserWindow.setOverLink("", null);
    },

    fillTooltip : function(tooltip, event) {
      const elt = document.tooltipNode, line1 = tooltip.firstChild, line2 = tooltip.lastChild;
      const text1 = elt.preferredTooltipText || elt.getAttribute("fallbackTooltipText");
      const text2 = elt.linkURL;
      line1.hidden = !(line1.value = text1);
      line2.hidden = !(line2.value = text2);
      // don't show the tooltip if it's over a submenu of the More menu
      return !(!text1 && !text2); // return a bool, not a string; [OR] == NAND ( !A !B )
    },

    itemClicked : function(e) {
      if(e.button != 1) return;
      LinkWidgetCore.loadPage(e);
      // close any menus
      var p = e.target;
      while(p.localName!="toolbarbutton") {
        if(p.localName=="menupopup") p.hidePopup();
        p = p.parentNode;
      }
    },

    buttonRightClicked : function(e) {
      const t = e.target, ot = e.originalTarget;
      if(ot.localName=="toolbarbutton" && t.numLinks > 1) t.firstChild.showPopup();
    },

    loadPage : function(e) {
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
      LinkWidgetCore.loadPageInCurrentBrowser(url);
    },

    go : function(rel) {
      const links = content.document.linkWidgetLinks || {};
      if(!links[rel]) return;
      LinkWidgetCore.loadPageInCurrentBrowser(links[rel][0].url);
    },

    loadPageInCurrentBrowser : function(url) {
      // urlSecurityCheck wanted a URL-as-string for Fx 2.0, but an nsIPrincipal on trunk
    
        if(gBrowser.contentPrincipal) urlSecurityCheck(url, gBrowser.contentPrincipal);
        else urlSecurityCheck(url, content.document.documentURI);
        gBrowser.loadURI(url);
    
      content.focus();
    },

    // arg is an nsIDOMLocation, with protocol of http(s) or ftp
    guessUp : function (location) {
        const ignoreRE = LinkWidgetCore.regexps.guess_up_skip;
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
    relConversions : {
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

    revToRel : {
      made: "author",
      next: "prev",
      prev: "next",
      previous: "next"
    },

    getLinkRels : function (relStr, revStr, mimetype, title) {
LinkWidgetCore.lw_dump('LinkWidgetCore.getLinkRels');
  // Ignore certain links
  if(LinkWidgetCore.regexps.ignore_rels.test(relStr)) return null;
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
      rel = rel in LinkWidgetCore.relConversions ? LinkWidgetCore.relConversions[rel] : rel;
      if(rel) rels[rel] = true, haveRels = true;
    }
  }
  if(revStr) {
    var revValues = revStr.split(whitespace);
    for(i = 0; i < revValues.length; i++) {
      rel = revToRel[revValues[i].toLowerCase()] || null;
      if(rel) rels[rel] = true, haveRels = true;
    }
  }
  return haveRels ? rels : null;
},

loadStringBundle : function (bundlePath) {
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
languageNames : null,

// code is a language code, e.g. en, en-GB, es, fr-FR
getLanguageName : function (code) {
    if(!LinkWidgetCore.languageNames) LinkWidgetCore.languageNames =
      LinkWidgetCore.loadStringBundle("chrome://global/locale/languageNames.properties");
    const dict = LinkWidgetCore.languageNames;
    if(code in dict) return dict[code];
    // if we have something like "en-GB", change to "English (GB)"
    var parts = code.match(/^(.{2,3})-(.*)$/);
    // xxx make the parentheses localizable
    if(parts && parts[1] in dict) return dict[parts[1]]+" ("+parts[2]+")";
    return code;
},

scanPageForLinks : function (doc) {
LinkWidgetCore.lw_dump('Scan');
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
    var rels = (link.rel || link.rev) && LinkWidgetCore.getLinkRels(link.rel, link.rev);
    if(!rels) {
      var rel = LinkWidgetCore.guessLinkRel(link, txt);
      if(rel) rels = {}, rels[rel] = true;
    }
    if(rels) LinkWidgetCore.addLinkForPage(href, txt, link.hreflang, null, doc, rels);
  }
},

// link is an <a href> link
guessLinkRel : function (link, txt) {
LinkWidgetCore.lw_dump('guessLinkRel');
  if(LinkWidgetCore.regexps.next.test(txt)) return "next";
  if(LinkWidgetCore.regexps.prev.test(txt)) return "prev";
  if(LinkWidgetCore.regexps.first.test(txt)) return "first";
  if(LinkWidgetCore.regexps.last.test(txt)) return "last";
  const imgs = link.getElementsByTagName("img"), num = imgs.length;
  for(var i = 0; i != num; ++i) {
    // guessing is more accurate on relative URLs, and .src is always absolute
    var src = imgs[i].getAttribute("src");
    if(LinkWidgetCore.regexps.img_next.test(src)) return "next";
    if(LinkWidgetCore.regexps.img_prev.test(src)) return "prev";
    if(LinkWidgetCore.regexps.img_first.test(src)) return "first";
    if(LinkWidgetCore.regexps.img_last.test(src)) return "last";
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
      LinkWidgetCore.addLinkForPage(pre + prv + post, null, null, null, doc, { prev: true });
    }
    if(guessNext) {
      var nxt = ""+(num+1);
      while(nxt.length < old.length) nxt = "0" + nxt;
      LinkWidgetCore.addLinkForPage(pre + nxt + post, null, null, null, doc, { next: true });
    }
}


};

window.addEventListener("load", LinkWidgetCore.startup, false);
window.addEventListener("unload", LinkWidgetCore.shutdown, false);


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
      if(this.lang) longTitle += LinkWidgetCore.getLanguageName(this.lang) + ": ";
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
  elt.onmouseover = LinkWidgetCore.mouseEnter;
  elt.onmouseout = LinkWidgetCore.mouseExit;
  elt.onclick = LinkWidgetCore.itemClicked;
  elt.oncontextmenu = LinkWidgetCore.buttonRightClicked;
  elt.setAttribute("oncommand", "LinkWidgetCore.loadPage(event);"); // .oncommand does not exist
  elt.setAttribute("context", "");
  elt.setAttribute("tooltip", "linkwidget-tooltip");

  elt.addEventListener("DOMMouseScroll", LinkWidgetCore.mouseScrollHandler, false);

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
    const relStr = LinkWidgetCore.strings[rel] || rel;
    const relclass = LinkWidgetCore.buttonRels[rel] ? " linkwidget-rel-"+rel : "";
    mi.className = "menuitem-iconic linkwidget-menuitem " + relclass;
    mi.setAttribute("label", relStr);
    const m = this.menu = document.createElement("menu");
    m.setAttribute("label", LinkWidgetCore.strings["2"+rel] || relStr);
    m.hidden = true;
    m.className = "menu-iconic linkwidget-menu" + relclass;
    const p = this.popup = document.createElement("menupopup");
    p.setAttribute("onpopupshowing", "this.linkWidgetItem.buildMenu();");

    mi.linkWidgetItem = m.linkWidgetItem = p.linkWidgetItem = this;
    mi.relNum = m.relNum = this.relNum;
    m.appendChild(p);
    
    const mpopup = LinkWidgetCore.morePopup, kids = mpopup.childNodes, num = kids.length;
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
