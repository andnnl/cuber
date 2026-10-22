import Vue, { VNode } from "vue";
import Vuetify from "vuetify";
import "vuetify/dist/vuetify.min.css";
import "material-design-icons/iconfont/material-icons.css";
import "./index.css";
import AppShell from "./vue/AppShell";

/* eslint-disable */
var _hmt: any = _hmt || [];
(function () {
  if (location.hostname === '127.0.0.1') return; // 桌面离线版不加载外部统计脚本
  var hm = document.createElement("script");
  hm.src = "https://hm.baidu.com/hm.js?e3fd96123e7614cd5ea9dc70df73217f";
  var s = document.getElementsByTagName("script")[0];
  s.parentNode?.insertBefore(hm, s);
})();
/* eslint-disable */

Vue.use(Vuetify);
const opts = {};
const vuetify = new Vuetify(opts);
Vue.prototype.vuetify = vuetify;

const search = location.search || "";
const list = search.match(/(\?|\&)mode=([^&]*)(&|$)/);
const mode = list ? list[2] : "playground";
Vue.prototype.mode = mode;

if (mode === "reset") {
  window.localStorage.clear();
  window.location.replace(window.location.origin + window.location.pathname);
}
const vm = new Vue({
  vuetify,
  el: "#app",
  render: (h): VNode => h(AppShell),
});
export default vm;
