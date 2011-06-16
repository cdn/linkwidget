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

window.addEventListener("load", linkWidget.Startup, false);
window.addEventListener("unload", linkWidget.Shutdown, false);

function linkWidget () {/*}

linkWidget.prototype = {
*/

//const linkWidgetPrefPrefix = "extensions.linkwidget.";
 PrefPrefix : "extensions.linkwidget.",

 GuessUpAndTopFromURL : false,
 PrefGuessPrevAndNextFromURL : false,
 PrefScanHyperlinks : false,
 Strings : "chrome://linkwidget/locale/main.strings",
 Buttons : {}, // rel -> <toolbarbutton> map
 Views : {},   // rel -> view map, the views typically being a menu+menuitem
 MoreMenu : null,
 MorePopup : null,


// Used in link-guessing. Populated from preferences with related names.
 Regexps : {
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
 MenuRels : {}, // rel -> true map
 _MenuRels : ["chapter", "section", "subsection", "bookmark", "alternate"],

// known rels in the order they should appear on the More menu
 MenuOrdering : {}, // rel -> int map
 _MenuOrdering : [
  "top","up","first","prev","next","last","toc","chapter","section","subsection","appendix",
  "glossary","index","help","search","author","copyright","bookmark","alternate"
],

 ButtonRels : {}, // rel -> true map
 _ButtonRels : ["top","up","first","prev","next","last"],


Startup : function () {
  window.removeEventListener("load", linkWidget.Startup, false);
  linkWidget.Strings = linkWidgetLoadStringBundle(linkWidget.Strings);
  for(var i in linkWidget._MenuOrdering) linkWidget.MenuOrdering[linkWidget._MenuOrdering[i]] = (i-0) + 1;
  for each(i in linkWidget._MenuRels) linkWidget.MenuRels[i] = true;
  for each(i in linkWidget._ButtonRels) linkWidget.ButtonRels[i] = true;
  linkWidget.InitMoreMenu();
  linkWidget.InitVisibleButtons();
  setTimeout(linkWidget.DelayedStartup, 1); // needs to happen after Fx's delayedStartup(); Fc?
},

InitMoreMenu : function () {
  linkWidget.MoreMenu = document.getElementById("linkwidget-more-menu");
  linkWidget.MorePopup = document.getElementById("linkwidget-more-popup");
},

InitVisibleButtons : function () {
  linkWidget.Buttons = {};
  for(var rel in linkWidget.ButtonRels) {
    var elt = document.getElementById("linkwidget-"+rel);
    if(elt) linkWidget.Buttons[rel] = LinkWidget.initButton(elt, rel);
  }
},


// Top, Up, First, Prev, Next, and Last menu-buttons
// Hackery employed to disable the dropmarker if there is just one link.
initButton : function (elt, rel) {
  if(elt.alreadyInitialised) return elt;
  elt.alreadyInitialised = true;
  elt.rel = rel;
  // to avoid repetitive XUL
  elt.onmouseover = linkWidget.MouseEnter;
  elt.onmouseout = linkWidget.MouseExit;
  elt.onclick = linkWidget.ItemClicked;
  elt.oncontextmenu = linkWidget.ButtonRightClicked;
  elt.setAttribute("oncommand", "linkWidget.LoadPage(event);"); // .oncommand does not exist
  elt.setAttribute("context", "");
  elt.setAttribute("tooltip", "linkwidget-tooltip");
  elt.addEventListener("DOMMouseScroll", linkWidget.MouseScrollHandler, false);
  for(var i in linkWidget.Button) elt[i] = linkWidget.Button[i];
  var popup = elt.popup = document.createElement("menupopup");
  elt.appendChild(popup);
  popup.setAttribute("onpopupshowing", "return this.parentNode.buildMenu();");
  // hackish
  var anonKids = document.getAnonymousNodes(elt);
  elt.dropMarker = anonKids[anonKids.length-1];
  return elt;
},


 EventHandlers : {
  "select": "linkWidgetTabSelectedHandler",
  "DOMLinkAdded": "linkWidgetLinkAddedHandler",
  "pagehide": "linkWidgetPageHideHandler",
  "DOMContentLoaded": "linkWidgetPageLoadedHandler",
  "pageshow": "linkWidgetPageShowHandler"
},


DelayedStartup : function () {
  linkWidget.LoadPrefs();
  gPrefService.addObserver(linkWidget.PrefPrefix, linkWidget.PrefObserver, false);
  for(var h in linkWidget.EventHandlers) {
      gBrowser.addEventListener(h, window[linkWidget.EventHandlers[h]], false); // 3.6
      gBrowser.tabContainer.addEventListener(h, window[linkWidget.EventHandlers[h]], false); // 4.01+
  }
  // replace the toolbar customisation callback
    var box = document.getElementById("navigator-toolbox");
    box._preLinkWidget_customizeDone = box.customizeDone;
    box.customizeDone = linkWidget.ToolboxCustomizeDone;
},


LoadPrefs : function () {

const branch = Components.classes["@mozilla.org/preferences-service;1"]
                         .getService(Components.interfaces.nsIPrefService)
                         .QueryInterface(Components.interfaces.nsIPrefBranch)
                         .getBranch(linkWidget.PrefPrefix);
//  const branch = gPrefService.getBranch(linkWidgetPrefPrefix);
  linkWidget.PrefScanHyperlinks = branch.getBoolPref("scanHyperlinks");
  linkWidget.GuessUpAndTopFromURL = branch.getBoolPref("guessUpAndTopFromURL");
  linkWidget.PrefGuessPrevAndNextFromURL = branch.getBoolPref("guessPrevAndNextFromURL");
  // Isn't retrieving unicode strings from the pref service fun?
  const nsIStr = Components.interfaces.nsISupportsString;
  for(var prefname in linkWidget.Regexps) {
    var raw = branch.getComplexValue("regexp." + prefname, nsIStr).data;
    // RegExpr throws an exception if the string isn't a valid regexp pattern
    try {
      linkWidget.Regexps[prefname] = new RegExp(raw, "i");
    } catch(e) {
      Components.utils.reportError(e);
      // A regexp that can never match (since multiline flag not set)
      linkWidget.Regexps[prefname] = /$ /;
    }
  }
},

PrefObserver : {
  observe: function(subject, topic, data) {
//    dump("lwpref: subject="+subject.root+" topic="+topic+" data="+data+"\n");
    // there're only three/four of them
    linkWidget.LoadPrefs();
  }
},

ToolboxCustomizeDone : function (somethingChanged) {
  this._preLinkWidget_customizeDone(somethingChanged);
  if(!somethingChanged) return;

  linkWidget.InitMoreMenu();
  for each(var btn in linkWidget.Buttons) btn.show(null);
  linkWidget.InitVisibleButtons();
  for(var rel in linkWidget.Views) {
    var item = linkWidget.Views[rel];
    if(!linkWidget.Buttons[rel] && linkWidget.MoreMenu) continue;
    item.destroy();
    delete linkWidget.Views[rel];
  }
  // Can end up incorrectly enabled if e.g. only the Top menuitem was active,
  // and that gets replaced by a button.
  if(linkWidget.MoreMenu) linkWidget.MoreMenu.disabled = true;

  linkWidget.RefreshLinks();
},


RefreshLinks : function () {
//alert('lWRL');
  for each(var btn in linkWidget.Buttons) btn.show(null);
  if(linkWidget.MoreMenu) linkWidget.MoreMenu.disabled = true;

  const doc = content.document, links = doc.linkWidgetLinks;
  if(!links) return;

  var enableMoreMenu = false;
  for(var rel in links) {
    if(rel in linkWidget.Buttons) linkWidget.Buttons[rel].show(links[rel]);
    else enableMoreMenu = true;
  }
  if(linkWidget.MoreMenu && enableMoreMenu) linkWidget.MoreMenu.disabled = false;
},


Shutdown : function () {
  window.removeEventListener("unload", linkWidget.Shutdown, false);
  for(var h in linkWidget.EventHandlers) {
      gBrowser.removeEventListener(h, window[linkWidget.EventHandlers[h]], false);  
  }
  gPrefService.removeObserver(linkWidget.PrefPrefix, linkWidget.PrefObserver);
},

// Used to make the page scroll when the mouse-wheel is used on one of our buttons
MouseScrollHandler : function (event) {
  content.scrollBy(0, event.detail);
},


LinkAddedHandler : function (event) {
  var elt = event.originalTarget;
  var doc = elt.ownerDocument;
  if(!(elt instanceof HTMLLinkElement) || !elt.href || !(elt.rel || elt.rev)) return;
  var rels = linkWidget.GetLinkRels(elt.rel, elt.rev, elt.type, elt.title);
  if(rels) linkWidget.AddLinkForPage(elt.href, elt.title, elt.hreflang, elt.media, doc, rels);
},


// null values mean that rel should be ignored
 RelConversions : {
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

 RevToRel : {
  made: "author",
  next: "prev",
  prev: "next",
  previous: "next"
},

GetLinkRels : function (relStr, revStr, mimetype, title) {
  // Ignore certain links
  if(linkWidget.Regexps.ignore_rels.test(relStr)) return null;
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
      rel = rel in linkWidget.RelConversions ? linkWidget.RelConversions[rel] : rel;
      if(rel) rels[rel] = true, haveRels = true;
    }
  }
  if(revStr) {
    var revValues = revStr.split(whitespace);
    for(i = 0; i < revValues.length; i++) {
      rel = linkWidget.RevToRel[revValues[i].toLowerCase()] || null;
      if(rel) rels[rel] = true, haveRels = true;
    }
  }
  return haveRels ? rels : null;
},


AddLinkForPage : function (url, txt, lang, media, doc, rels) {
  const link = new LinkWidgetLink(url, txt, lang, media); // obj.js
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
    if(rel in linkWidget.Buttons) linkWidget.Buttons[rel].show(doclinks[rel]);
    else enableMoreMenu = true;
  }
  if(linkWidget.MoreMenu && enableMoreMenu) linkWidget.MoreMenu.disabled = false;
},


// Really ought to delete/nullify doc.linkWidgetLinks on "close" (but not on "pagehide")
PageHideHandler : function (event) {
  // Links like: <a href="..." onclick="this.style.display='none'">.....</a>
  // (the onclick handler could instead be on an ancestor of the link) lead to unload/pagehide
  // events with originalTarget==a text node.  So use ownerDocument (which is null for Documents)
  var doc = event.originalTarget;
  if(!(doc instanceof Document)) doc = doc.ownerDocument;
  // don't clear the links for unload/pagehide from a background tab, or from a subframe
  // If docShell is null accessing .contentDocument throws an exception
  if(!gBrowser.docShell || doc != gBrowser.contentDocument) return;
  for each(var btn in linkWidget.Buttons) btn.show(null);
  if(linkWidget.MoreMenu) linkWidget.MoreMenu.disabled = true;
},


PageLoadedHandler : function (event) {
  const doc = event.originalTarget, win = doc.defaultView;
  if(win != win.top || doc.linkWidgetHasGuessedLinks) return;

  doc.linkWidgetHasGuessedLinks = true;
  const links = doc.linkWidgetLinks || (doc.linkWidgetLinks = {});
  const isHTML = doc instanceof HTMLDocument && !(doc instanceof ImageDocument);

  if(linkWidget.PrefScanHyperlinks && isHTML) linkWidget.ScanPageForLinks(doc);

  const loc = doc.location, protocol = loc.protocol;
  if(!/^(?:https?|ftp|file)\:$/.test(protocol)) return;

  if(linkWidget.PrefGuessPrevAndNextFromURL || !isHTML)
    linkWidget.GuessPrevNextLinksFromURL(doc, !links.prev, !links.next);

  if(!linkWidget.GuessUpAndTopFromURL && isHTML) return;
  if(!links.up) {
    var upUrl = linkWidget.GuessUp(loc);
    if(upUrl) linkWidget.AddLinkForPage(upUrl, null, null, null, doc, {up: true});
  }
  if(!links.top) {
    var topUrl = protocol + "//" + loc.host + "/"
    linkWidget.AddLinkForPage(topUrl, null, null, null, doc, {top: true});
  }
},


TabSelectedHandler : function (event) {
//  let newTab = event.originalTarget;
  if(event.originalTarget.localName != "tabs") return;
  linkWidget.RefreshLinks();
},

// xxx isn't this too keen to refresh?
PageShowHandler : function (event) {
  const doc = event.originalTarget;
  // Link guessing for things with no DOMContentLoaded (e.g. ImageDocument)
  if(!doc.linkWidgetHasGuessedLinks) linkWidget.PageLoadedHandler(event);
  // If docShell is null accessing .contentDocument throws an exception
  if(!gBrowser.docShell || doc != gBrowser.contentDocument) return;
  linkWidget.RefreshLinks();
},


OnMoreMenuShowing : function () {
  const linkmaps = content.document.linkWidgetLinks;
  // Update all existing views
  for(var rel in linkWidget.Views) linkWidget.Views[rel].show(linkmaps[rel] || null);
  // Create any new views that are needed
  for(rel in linkmaps) {
    if(rel in linkWidget.Views || rel in linkWidget.Buttons) continue;
    var relNum = linkWidget.MenuOrdering[rel] || Infinity;
    var isMenu = rel in linkWidget.MenuRels;
    var item = linkWidget.Views[rel] =
      isMenu ? new LinkWidgetMenu(rel, relNum) : new LinkWidgetItem(rel, relNum); // obj.js
    item.show(linkmaps[rel]);
  }
},


MouseEnter : function (e) {
  const t = e.target;
  XULBrowserWindow.setOverLink(t.linkURL || "", null);
},

MouseExit : function (e) {
  const t = e.target;
  XULBrowserWindow.setOverLink("", null);
},


FillTooltip : function (tooltip, event) {
  const elt = document.tooltipNode, line1 = tooltip.firstChild, line2 = tooltip.lastChild;
  const text1 = elt.preferredTooltipText || elt.getAttribute("fallbackTooltipText");
  const text2 = elt.linkURL;
  line1.hidden = !(line1.value = text1);
  line2.hidden = !(line2.value = text2);
  // don't show the tooltip if it's over a submenu of the More menu
  return !(!text1 && !text2); // return a bool, not a string; [OR] == NAND ( !A !B )
},

ItemClicked : function (e) {
  if(e.button != 1) return;
  linkWidgetLoadPage(e);
  // close any menus
  var p = e.target;
  while(p.localName!="toolbarbutton") {
    if(p.localName=="menupopup") p.hidePopup();
    p = p.parentNode;
  }
},

ButtonRightClicked : function (e) {
  const t = e.target, ot = e.originalTarget;
  if(ot.localName=="toolbarbutton" && t.numLinks > 1) t.firstChild.showPopup();
},

LoadPage : function (e) {
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
  linkWidget.LoadPageInCurrentBrowser(url);
},

Go : function (rel) {
  const links = content.document.linkWidgetLinks || {};
  if(!links[rel]) return;
  linkWidget.LoadPageInCurrentBrowser(links[rel][0].url);
},

LoadPageInCurrentBrowser : function (url) {
  // urlSecurityCheck wanted a URL-as-string for Fx 2.0, but an nsIPrincipal on trunk

    if(gBrowser.contentPrincipal) urlSecurityCheck(url, gBrowser.contentPrincipal);
    else urlSecurityCheck(url, content.document.documentURI);
    gBrowser.loadURI(url);

  content.focus();
},


// a map from 2/3-letter lang codes to the langs' names in the current locale
 LanguageNames : null,

// code is a language code, e.g. en, en-GB, es, fr-FR
GetLanguageName : function (code) {
    if(!linkWidget.LanguageNames) linkWidget.LanguageNames =
      linkWidget.LoadStringBundle("chrome://global/locale/languageNames.properties");
    const dict = linkWidget.LanguageNames;
    if(code in dict) return dict[code];
    // if we have something like "en-GB", change to "English (GB)"
    var parts = code.match(/^(.{2,3})-(.*)$/);
    // xxx make the parentheses localizable
    if(parts && parts[1] in dict) return dict[parts[1]]+" ("+parts[2]+")";
    return code;
},

LoadStringBundle : function (bundlePath) {
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

// arg is an nsIDOMLocation, with protocol of http(s) or ftp
GuessUp : function (location) {
    const ignoreRE = linkWidget.Regexps.guess_up_skip;
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

GuessPrevNextLinksFromURL : function (doc, guessPrev, guessNext) {
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
      linkWidget.AddLinkForPage(pre + prv + post, null, null, null, doc, { prev: true });
    }
    if(guessNext) {
      var nxt = ""+(num+1);
      while(nxt.length < old.length) nxt = "0" + nxt;
      linkWidget.AddLinkForPage(pre + nxt + post, null, null, null, doc, { next: true });
    }
},

ScanPageForLinks : function (doc) {
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
    var rels = (link.rel || link.rev) && linkWidget.GetLinkRels(link.rel, link.rev);
    if(!rels) {
      var rel = linkWidget.GuessLinkRel(link, txt);
      if(rel) rels = {}, rels[rel] = true;
    }
    if(rels) linkWidget.AddLinkForPage(href, txt, link.hreflang, null, doc, rels);
  }
},


// link is an <a href> link
GuessLinkRel : function (link, txt) {
  if(linkWidget.Regexps.next.test(txt)) return "next";
  if(linkWidget.Regexps.prev.test(txt)) return "prev";
  if(linkWidget.Regexps.first.test(txt)) return "first";
  if(linkWidget.Regexps.last.test(txt)) return "last";
  const imgs = link.getElementsByTagName("img"), num = imgs.length;
  for(var i = 0; i != num; ++i) {
    // guessing is more accurate on relative URLs, and .src is always absolute
    var src = imgs[i].getAttribute("src");
    if(linkWidget.Regexps.img_next.test(src)) return "next";
    if(linkWidget.Regexps.img_prev.test(src)) return "prev";
    if(linkWidget.Regexps.img_first.test(src)) return "first";
    if(linkWidget.Regexps.img_last.test(src)) return "last";
  }
  return null;
},

};

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
      if(this.lang) longTitle += linkWidgetGetLanguageName(this.lang) + ": ";
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



const linkWidgetButton = {
  __proto__: linkWidgetItemBase,
  numLinks: 0,

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
    const relStr = linkWidgetStrings[rel] || rel;
    const relclass = linkWidgetButtonRels[rel] ? " linkwidget-rel-"+rel : "";
    mi.className = "menuitem-iconic linkwidget-menuitem " + relclass;
    mi.setAttribute("label", relStr);
    const m = this.menu = document.createElement("menu");
    m.setAttribute("label", linkWidgetStrings["2"+rel] || relStr);
    m.hidden = true;
    m.className = "menu-iconic linkwidget-menu" + relclass;
    const p = this.popup = document.createElement("menupopup");
    p.setAttribute("onpopupshowing", "this.linkWidgetItem.buildMenu();");

    mi.linkWidgetItem = m.linkWidgetItem = p.linkWidgetItem = this;
    mi.relNum = m.relNum = this.relNum;
    m.appendChild(p);
    
    const mpopup = linkWidgetMorePopup, kids = mpopup.childNodes, num = kids.length;
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
