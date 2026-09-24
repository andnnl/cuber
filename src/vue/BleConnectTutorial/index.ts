import Vue from "vue";
import { Component } from "vue-property-decorator";
import "./index.css";

@Component({
  template: require("./index.html"),
})
export default class BleConnectTutorial extends Vue {
  mounted(): void {
    document.title = "蓝牙魔方连接教程 - 魔方栈";
  }
}
