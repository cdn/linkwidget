pref("extensions.linkwidget.guessUpAndTopFromURL", true);
pref("extensions.linkwidget.guessPrevAndNextFromURL", false);
pref("extensions.linkwidget.scanHyperlinks", true);

/// Regular Expressions for various aspects of link guessing, all treated as
/// case-insensitive, and read as nsISupportsString ComplexValue prefs (so we
/// can use unicode).  Remember to double-escape \'s (i.e. use \\b, not \b)

// We ignore <link>s if their rel attribute matches this regexp.
// "meta" is for FOAF - see mozdev bug 10027 and/or http://rdfweb.org/topic/Autodiscovery
// "schema.foo" is used by Dublin Core and FOAF.
// "icon" turns up as "shortcut icon" too, I think.
// "stylesheet" is here because of "alternate stylesheet", which also needs ignoring
// pingback, fontdef and p3pv are inherited from Mozilla. XXX could they be moved to standardiseRelType?
pref("extensions.linkwidget.regexp.ignore_rels",
  "\\b(?:stylesheet\\b|icon\\b|pingback\\b|fontdef\\b|p3pv|schema\.|meta\\b)");

// Improves URL-based up-guessing by going ".../foo/index.html" -> ".../"
// (skipping ".../foo/")
pref("extensions.linkwidget.regexp.guess_up_skip", "(?:index|main)\\.[\\w.]+?$");

/// If regexp.prev matches text of an <a href> link, we guess rel=prev.  Ditto
/// for .next, .first, .last.  If regexp.img_prev matches the src attribute of
/// an <img> within an <a href> link then we guess rel=prev (and similar for
/// img_*).

// XXX pages vary as to whether |< and << or << and < mean first and prev

// "\u00ab \u00bb" = "« »"
pref("extensions.linkwidget.regexp.first",
  "^first\\b|\\bfirst$|^begin|\\|<");
// Note that this ignores "back to foo" links
pref("extensions.linkwidget.regexp.prev",
  "^prev(?:ious)?\\b|prev$|previous$|^back\\b(?! to\\b)|\\bback$|^<<?-?\\s?$|^«$");
pref("extensions.linkwidget.regexp.next",
  "^next\\b|\\bcontinue\\b|next$|^\\s?-?>?>$|^»$");
// ? >\u007c| ?
pref("extensions.linkwidget.regexp.last",
  "last\\b|\\blast$|^end\\b|>\\|");

pref("extensions.linkwidget.regexp.img_first", "first");
// match [p]revious, but not [p]review
pref("extensions.linkwidget.regexp.img_prev", "rev(?!iew)");
pref("extensions.linkwidget.regexp.img_next", "ne?xt|fwd|forward");
pref("extensions.linkwidget.regexp.img_last", "last");
