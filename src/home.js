import { initAsciiHero } from "./hero.js";

const destroyHero = initAsciiHero(document.getElementById("heroAscii"));

window.addEventListener("beforeunload", () => {
  destroyHero();
});
