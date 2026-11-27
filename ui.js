// Page chrome that must work even if the figures fail to load: the colour theme switch and the phone menu.
(function () {
  var root = document.documentElement;

  // theme: auto follows the system setting; light and dark are the visitor's own choice, remembered on this device
  var ORDER = ["auto", "light", "dark"], themeBtn = document.getElementById("theme-btn");
  function current() { return root.dataset.theme === "light" || root.dataset.theme === "dark" ? root.dataset.theme : "auto"; }
  function show() {
    var now = current(), next = ORDER[(ORDER.indexOf(now) + 1) % ORDER.length];
    themeBtn.textContent = "Theme: " + now;
    themeBtn.setAttribute("aria-label", "Colour theme: " + now + ". Switch to " + next + ".");
  }
  themeBtn.addEventListener("click", function () {
    var next = ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length];
    if (next === "auto") delete root.dataset.theme; else root.dataset.theme = next;
    try { if (next === "auto") localStorage.removeItem("ste-theme"); else localStorage.setItem("ste-theme", next); } catch (e) {}
    show();
  });
  show();

  // phone menu: a button that opens the section links; Escape or picking a link closes it
  var menuBtn = document.getElementById("menu-btn"), nav = document.getElementById("bar-nav");
  function setMenu(open, refocus) {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    if (!open && refocus) menuBtn.focus();
  }
  menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
  nav.addEventListener("click", function (ev) { if (ev.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && nav.classList.contains("open")) setMenu(false, true); });
  document.addEventListener("click", function (ev) { if (nav.classList.contains("open") && !ev.target.closest(".bar")) setMenu(false); });
})();
