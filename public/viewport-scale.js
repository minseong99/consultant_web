// 창이 좁아질 때 배치를 바꾸지 않고 화면 전체를 같은 비율로 줄인다.
// 기준 폭(1200px)보다 좁고 640px 이상인 창에서는 1200px 폭의 화면을 그대로 축소해 보여 준다.
// 640px 미만(휴대폰)은 축소하면 글자를 읽을 수 없으므로 휴대폰용 배치를 쓴다.
// 1200px 이상은 축소하지 않고 내용이 화면 폭을 채운다.
// 배치가 바뀌는 지점은 app/globals.css 의 --breakpoint-* 와 맞춰져 있다(md·lg·xl 이 모두 640px).
(function () {
  var DESIGN = 1200;
  var MIN = 640;
  function apply() {
    var width = window.innerWidth;
    var zoom = width >= MIN && width < DESIGN ? width / DESIGN : 1;
    var style = document.documentElement.style;
    style.zoom = zoom === 1 ? "" : String(zoom);
    // 화면 높이·폭 단위(vh, vw)로 잡은 크기는 축소 비율만큼 되돌려야 한다(globals.css 에서 쓴다).
    style.setProperty("--page-zoom", String(zoom));
  }
  apply();
  window.addEventListener("resize", apply);
})();
