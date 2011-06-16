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
