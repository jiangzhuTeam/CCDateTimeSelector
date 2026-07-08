import { _decorator, Component, instantiate, Node, Prefab, Label } from "cc";
import { DateTimePicker, DateTimePickerResult } from "./DateTimePicker";

const { ccclass, property, menu } = _decorator;

/**
 * 日期时间选择器测试脚本
 *
 * 使用步骤：
 * 1. 场景里放一个空节点，挂上本组件
 * 2. 把 dateTimePicker.prefab 拖到 dateTimePickerPrefab 属性
 * 3.（可选）放一个 Button 节点，拖到 triggerBtn；放一个 Label 拖到 resultLabel
 * 4. 运行场景，点击按钮（或点击本节点）即可弹出选择器
 *
 * 也可以直接勾选 openOnStart，运行后自动弹出。
 */
@ccclass('DateTimePickerTest')
@menu('Game/UI/DateTimePickerTest（选择器测试）')
export class DateTimePickerTest extends Component {
    @property({ type: Prefab, tooltip: "dateTimePicker.prefab" })
    dateTimePickerPrefab: Prefab = null!;

    @property({ type: Node, tooltip: "触发按钮（可选，不填则点击本节点触发）" })
    triggerBtn: Node = null!;

    @property({ type: Label, tooltip: "显示选择结果的 Label（可选）" })
    resultLabel: Label = null!;

    @property({ tooltip: "是否显示时/分/秒" })
    showTime: boolean = false;

    @property({ tooltip: "运行后自动弹出一次" })
    openOnStart: boolean = false;

    /** 记住上次选择的日期 */
    private _lastDate: Date = new Date();

    start() {
        const btn = this.triggerBtn || this.node;
        btn.on(Node.EventType.TOUCH_END, this.openPicker, this);

        if (this.openOnStart) this.openPicker();
    }

    onDestroy() {
        const btn = this.triggerBtn || this.node;
        btn.off(Node.EventType.TOUCH_END, this.openPicker, this);
    }

    /** 弹出日期时间选择器 */
    openPicker(): void {
        if (!this.dateTimePickerPrefab) {
            console.error("[DateTimePickerTest] 未设置 dateTimePickerPrefab");
            return;
        }

        // 实例化预制体，挂到当前界面根节点（保证在最上层）
        const node = instantiate(this.dateTimePickerPrefab);
        node.parent = this.node.scene.getChildByName("Canvas") || this.node;

        const picker = node.getComponent(DateTimePicker)!;
        picker.setOptions({
            showYear: true,
            showMonth: true,
            showDay: true,
            showHour: this.showTime,
            showMinute: this.showTime,
            showSecond: false,
            title: this.showTime ? "选择日期时间" : "选择日期",
            unit: true,
        });
        picker.setDate(this._lastDate);

        node.on("confirm", (r: DateTimePickerResult) => {
            this._lastDate = r.date;
            console.info("[DateTimePickerTest] 确认选择:", r.dateString);
            console.info("[DateTimePickerTest] 详细:", r);
            if (this.resultLabel) this.resultLabel.string = r.dateString;
            node.destroy();
        });

        node.on("cancel", () => {
            console.log("[DateTimePickerTest] 取消选择");
            node.destroy();
        });

        picker.show();
    }
}
