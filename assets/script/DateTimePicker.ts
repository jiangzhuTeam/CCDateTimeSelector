import {
    _decorator, Component, Node, UITransform, Label, Graphics, Color, Vec3,
    UIOpacity, tween, view, CCInteger, CCFloat,
} from "cc";
import { WheelColumn } from "./WheelColumn";

const { ccclass, property, menu } = _decorator;

/** 日期时间选择器配置项 */
export interface DateTimePickerOptions {
    /** 显示「年」列 */
    showYear?: boolean;
    /** 显示「月」列 */
    showMonth?: boolean;
    /** 显示「日」列 */
    showDay?: boolean;
    /** 显示「时」列 */
    showHour?: boolean;
    /** 显示「分」列 */
    showMinute?: boolean;
    /** 显示「秒」列 */
    showSecond?: boolean;
    /** 最小可选日期（默认 1900-01-01） */
    minDate?: Date;
    /** 最大可选日期（默认 当前年 +50） */
    maxDate?: Date;
    /** 标题文本 */
    title?: string;
    /** 是否显示中文单位（年/月/日/时/分/秒），默认 true */
    unit?: boolean;
}

/** 确认回调返回的结果 */
export interface DateTimePickerResult {
    date: Date;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    dateString: string;
}

type FieldType = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

interface ColumnDesc {
    field: FieldType;
    node: Node;
    wheel: WheelColumn;
}

/**
 * 日期时间选择器（iOS 风格滚轮）
 *
 * 纯 TS 实现，运行时自建全部 UI（半透明遮罩、面板、顶部栏、滚轮列、按钮），
 * 无任何图片资源依赖，全平台通用。
 *
 * 用法：
 * ```ts
 * const node = instantiate(dateTimePickerPrefab);
 * node.parent = this.node;                 // 挂到 Canvas 下
 * const picker = node.getComponent(DateTimePicker);
 * picker.setOptions({ showHour: false, showMinute: false, title: "选择出生日期" });
 * picker.setDate(new Date());
 * node.on("confirm", (r: DateTimePickerResult) => { console.log(r.dateString); node.destroy(); });
 * node.on("cancel", () => node.destroy());
 * picker.show();
 * ```
 */
@ccclass('DateTimePicker')
@menu('Game/UI/DateTimePicker（日期时间选择器）')
export class DateTimePicker extends Component {
    @property({ type: CCFloat, tooltip: "每项高度（像素）" })
    itemHeight: number = 66;

    @property({ type: CCInteger, tooltip: "可见行数（建议奇数）" })
    visibleCount: number = 5;

    @property({ type: CCFloat, tooltip: "面板宽度" })
    panelWidth: number = 690;

    @property({ type: Color, tooltip: "面板背景色" })
    panelColor: Color = new Color(255, 255, 255, 255);

    @property({ type: Color, tooltip: "遮罩颜色" })
    maskColor: Color = new Color(0, 0, 0, 128);

    @property({ type: Color, tooltip: "标题文字颜色" })
    titleColor: Color = new Color(51, 51, 51, 255);

    @property({ type: Color, tooltip: "确定按钮文字颜色" })
    confirmColor: Color = new Color(0, 122, 255, 255);

    @property({ type: Color, tooltip: "取消按钮文字颜色" })
    cancelColor: Color = new Color(150, 150, 150, 255);

    @property({ tooltip: "标题文本" })
    title: string = "选择日期";

    @property({ tooltip: "确定按钮文本" })
    confirmText: string = "Done";

    @property({ tooltip: "取消按钮文本" })
    cancelText: string = "Cancel";

    /** 顶部栏高度 */
    private readonly _topBarH: number = 96;

    private _options: Required<DateTimePickerOptions> = {
        showYear: true, showMonth: true, showDay: true,
        showHour: false, showMinute: false, showSecond: false,
        minDate: new Date(1900, 0, 1),
        maxDate: new Date(new Date().getFullYear() + 50, 11, 31),
        title: "选择日期",
        unit: true,
    };

    private _date: Date = new Date();

    private _built: boolean = false;
    private _panel: Node = null!;
    private _titleLabel: Label = null!;
    private _colsRoot: Node = null!;
    private _columns: ColumnDesc[] = [];
    private _bgMask: Node = null!;

    onLoad() {
        this.node.active = false;
    }

    // ==================== 公共接口 ====================

    /** 合并配置项 */
    setOptions(opts: DateTimePickerOptions): void {
        this._options = Object.assign({}, this._options, opts);
        if (opts.title != null) this.title = opts.title;
        this._clampDate();
        if (this._built) this._buildColumns();
    }

    /** 设置当前选中日期 */
    setDate(date: Date): void {
        if (date instanceof Date && !isNaN(date.getTime())) {
            this._date = new Date(date.getTime());
            this._clampDate();
            if (this._built) this._syncColumnsToDate();
        }
    }

    /** 获取当前选中日期 */
    getDate(): Date {
        return new Date(this._date.getTime());
    }

    /** 显示选择器 */
    show(): void {
        this._ensureBuilt();
        this._layout();
        this._buildColumns();
        this.node.active = true;

        // 遮罩淡入
        const maskOp = this._bgMask.getComponent(UIOpacity) || this._bgMask.addComponent(UIOpacity);
        maskOp.opacity = 0;
        tween(maskOp).to(0.2, { opacity: 255 }).start();

        // 面板弹入
        this._panel.setScale(0.9, 0.9, 1);
        const panelOp = this._panel.getComponent(UIOpacity) || this._panel.addComponent(UIOpacity);
        panelOp.opacity = 0;
        tween(this._panel).to(0.22, { scale: new Vec3(1, 1, 1) }).start();
        tween(panelOp).to(0.22, { opacity: 255 }).start();
    }

    /** 隐藏选择器 */
    hide(): void {
        this.node.active = false;
    }

    // ==================== 构建静态 UI ====================

    private _ensureBuilt(): void {
        if (this._built) return;
        this._built = true;

        const ut = this.getComponent(UITransform) || this.addComponent(UITransform);
        const vs = view.getVisibleSize();
        ut.setContentSize(vs.width, vs.height);

        // 背景遮罩（点击关闭）
        const bg = new Node('BgMask');
        this.node.addChild(bg);
        bg.addComponent(UITransform).setContentSize(vs.width, vs.height);
        bg.addComponent(Graphics);
        bg.addComponent(UIOpacity);
        bg.on(Node.EventType.TOUCH_END, this._onCancel, this);
        this._bgMask = bg;

        // 面板
        const panel = new Node('Panel');
        this.node.addChild(panel);
        const panelH = this._panelHeight();
        panel.addComponent(UITransform).setContentSize(this.panelWidth, panelH);
        panel.addComponent(Graphics);
        panel.addComponent(UIOpacity);
        // 拦截穿透到遮罩的点击
        panel.on(Node.EventType.TOUCH_END, () => { }, this);
        this._panel = panel;

        // 顶部栏文字
        const titleNode = this._createLabel('TitleLabel', this.title, 40, this.titleColor, panel);
        titleNode.setPosition(0, panelH / 2 - this._topBarH / 2, 0);
        this._titleLabel = titleNode.getComponent(Label)!;

        const cancelNode = this._createLabel('BtnCancel', this.cancelText, 34, this.cancelColor, panel);
        cancelNode.getComponent(UITransform)!.setContentSize(180, this._topBarH);
        cancelNode.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;
        cancelNode.setPosition(-this.panelWidth / 2 + 130, panelH / 2 - this._topBarH / 2, 0);
        cancelNode.on(Node.EventType.TOUCH_END, this._onCancel, this);

        const confirmNode = this._createLabel('BtnConfirm', this.confirmText, 34, this.confirmColor, panel);
        confirmNode.getComponent(UITransform)!.setContentSize(180, this._topBarH);
        confirmNode.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.RIGHT;
        confirmNode.setPosition(this.panelWidth / 2 - 130, panelH / 2 - this._topBarH / 2, 0);
        confirmNode.on(Node.EventType.TOUCH_END, this._onConfirm, this);

        // 中间选中高亮带
        const band = new Node('Band');
        panel.addChild(band);
        band.addComponent(UITransform).setContentSize(this.panelWidth - 40, this.itemHeight);
        band.addComponent(Graphics);
        band.setPosition(0, this._colsCenterY(), 0);

        // 列容器
        const cols = new Node('Cols');
        panel.addChild(cols);
        cols.addComponent(UITransform).setContentSize(this.panelWidth, this._wheelAreaH());
        cols.setPosition(0, this._colsCenterY(), 0);
        this._colsRoot = cols;
    }

    /** 绘制遮罩 / 面板 / 高亮带 */
    private _layout(): void {
        const vs = view.getVisibleSize();
        this.getComponent(UITransform)!.setContentSize(vs.width, vs.height);

        // 遮罩铺满屏幕
        this._bgMask.getComponent(UITransform)!.setContentSize(vs.width, vs.height);
        const bgG = this._bgMask.getComponent(Graphics)!;
        bgG.clear();
        bgG.fillColor = this.maskColor;
        bgG.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
        bgG.fill();

        // 面板圆角背景
        const panelH = this._panelHeight();
        const pG = this._panel.getComponent(Graphics)!;
        pG.clear();
        pG.fillColor = this.panelColor;
        pG.roundRect(-this.panelWidth / 2, -panelH / 2, this.panelWidth, panelH, 24);
        pG.fill();
        // 顶部栏分隔线
        pG.strokeColor = new Color(230, 230, 230, 255);
        pG.lineWidth = 2;
        const lineY = panelH / 2 - this._topBarH;
        pG.moveTo(-this.panelWidth / 2, lineY);
        pG.lineTo(this.panelWidth / 2, lineY);
        pG.stroke();

        // 中间高亮带
        const band = this._panel.getChildByName('Band')!;
        const bandG = band.getComponent(Graphics)!;
        bandG.clear();
        bandG.fillColor = new Color(0, 0, 0, 18);
        const bw = this.panelWidth - 40;
        bandG.roundRect(-bw / 2, -this.itemHeight / 2, bw, this.itemHeight, 12);
        bandG.fill();
    }

    private _panelHeight(): number {
        return this._topBarH + this._wheelAreaH() + 40;
    }

    private _wheelAreaH(): number {
        return this.visibleCount * this.itemHeight;
    }

    /** 滚轮区域中心 Y（面板局部坐标） */
    private _colsCenterY(): number {
        const panelH = this._panelHeight();
        const top = panelH / 2 - this._topBarH;
        return top - this._wheelAreaH() / 2 - 10;
    }

    private _createLabel(name: string, text: string, size: number, color: Color, parent: Node): Node {
        const n = new Node(name);
        parent.addChild(n);
        n.addComponent(UITransform).setContentSize(this.panelWidth, this._topBarH);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.lineHeight = size + 6;
        lbl.color = color;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        return n;
    }

    // ==================== 构建列 ====================

    private _enabledFields(): FieldType[] {
        const o = this._options;
        const fields: FieldType[] = [];
        if (o.showYear) fields.push('year');
        if (o.showMonth) fields.push('month');
        if (o.showDay) fields.push('day');
        if (o.showHour) fields.push('hour');
        if (o.showMinute) fields.push('minute');
        if (o.showSecond) fields.push('second');
        if (fields.length === 0) fields.push('year', 'month', 'day');
        return fields;
    }

    private _fieldWidth(field: FieldType): number {
        return field === 'year' ? 180 : 130;
    }

    private _buildColumns(): void {
        this._titleLabel.string = this.title;

        // 清理旧列
        for (const c of this._columns) c.node.destroy();
        this._columns = [];

        const fields = this._enabledFields();
        const spacing = 6;
        let total = 0;
        for (const f of fields) total += this._fieldWidth(f);
        total += spacing * (fields.length - 1);

        let x = -total / 2;
        for (const field of fields) {
            const w = this._fieldWidth(field);
            const node = new Node(`Col_${field}`);
            this._colsRoot.addChild(node);
            node.addComponent(UITransform).setContentSize(w, this._wheelAreaH());
            node.setPosition(x + w / 2, 0, 0);

            const wheel = node.addComponent(WheelColumn);
            wheel.itemHeight = this.itemHeight;
            wheel.visibleCount = this.visibleCount;
            wheel.fontSize = 40;
            wheel.setChangeCallback((idx) => this._onColumnChange(field, idx));

            const desc: ColumnDesc = { field, node, wheel };
            this._columns.push(desc);

            const { items, index } = this._itemsForField(field);
            wheel.setItems(items, index);

            x += w + spacing;
        }
    }

    /** 生成某一列的显示文本与当前索引 */
    private _itemsForField(field: FieldType): { items: string[]; index: number } {
        const o = this._options;
        const d = this._date;
        const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
        const u = (s: string) => (o.unit ? s : "");

        switch (field) {
            case 'year': {
                const min = o.minDate.getFullYear();
                const max = o.maxDate.getFullYear();
                const items: string[] = [];
                for (let y = min; y <= max; y++) items.push(`${y}${u('年')}`);
                return { items, index: d.getFullYear() - min };
            }
            case 'month': {
                const items: string[] = [];
                for (let m = 1; m <= 12; m++) items.push(`${m}${u('月')}`);
                return { items, index: d.getMonth() };
            }
            case 'day': {
                const dim = this._daysInMonth(d.getFullYear(), d.getMonth() + 1);
                const items: string[] = [];
                for (let i = 1; i <= dim; i++) items.push(`${i}${u('日')}`);
                return { items, index: Math.min(d.getDate(), dim) - 1 };
            }
            case 'hour': {
                const items: string[] = [];
                for (let i = 0; i < 24; i++) items.push(`${pad(i)}${u('时')}`);
                return { items, index: d.getHours() };
            }
            case 'minute': {
                const items: string[] = [];
                for (let i = 0; i < 60; i++) items.push(`${pad(i)}${u('分')}`);
                return { items, index: d.getMinutes() };
            }
            case 'second': {
                const items: string[] = [];
                for (let i = 0; i < 60; i++) items.push(`${pad(i)}${u('秒')}`);
                return { items, index: d.getSeconds() };
            }
        }
    }

    /** 某列滑动结束 */
    private _onColumnChange(field: FieldType, index: number): void {
        const o = this._options;
        switch (field) {
            case 'year': this._date.setFullYear(o.minDate.getFullYear() + index); break;
            case 'month': this._setMonthSafe(index); break;
            case 'day': this._date.setDate(index + 1); break;
            case 'hour': this._date.setHours(index); break;
            case 'minute': this._date.setMinutes(index); break;
            case 'second': this._date.setSeconds(index); break;
        }
        this._clampDate();

        // 年 / 月 变化时刷新「日」列（大小月、闰年）
        if (field === 'year' || field === 'month') this._refreshDayColumn();
    }

    /** 安全设置月份（避免 31 号跨月自动进位） */
    private _setMonthSafe(monthIndex: number): void {
        const dim = this._daysInMonth(this._date.getFullYear(), monthIndex + 1);
        if (this._date.getDate() > dim) this._date.setDate(dim);
        this._date.setMonth(monthIndex);
    }

    private _refreshDayColumn(): void {
        const dayCol = this._columns.find(c => c.field === 'day');
        if (!dayCol) return;
        const dim = this._daysInMonth(this._date.getFullYear(), this._date.getMonth() + 1);
        let day = this._date.getDate();
        if (day > dim) { day = dim; this._date.setDate(day); }
        const items: string[] = [];
        const u = this._options.unit ? '日' : '';
        for (let i = 1; i <= dim; i++) items.push(`${i}${u}`);
        dayCol.wheel.setItems(items, day - 1);
    }

    /** 将各列滚动到与 _date 一致 */
    private _syncColumnsToDate(): void {
        for (const c of this._columns) {
            const { index } = this._itemsForField(c.field);
            c.wheel.setIndex(index, false);
        }
    }

    private _daysInMonth(year: number, month: number): number {
        return new Date(year, month, 0).getDate();
    }

    private _clampDate(): void {
        const min = this._options.minDate.getTime();
        const max = this._options.maxDate.getTime();
        const t = this._date.getTime();
        if (t < min) this._date = new Date(min);
        else if (t > max) this._date = new Date(max);
    }

    // ==================== 按钮回调 ====================

    private _onConfirm(): void {
        const d = this._date;
        const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
        const o = this._options;

        const dateParts: string[] = [];
        if (o.showYear) dateParts.push(`${d.getFullYear()}`);
        if (o.showMonth) dateParts.push(pad(d.getMonth() + 1));
        if (o.showDay) dateParts.push(pad(d.getDate()));

        const timeParts: string[] = [];
        if (o.showHour) timeParts.push(pad(d.getHours()));
        if (o.showMinute) timeParts.push(pad(d.getMinutes()));
        if (o.showSecond) timeParts.push(pad(d.getSeconds()));

        let dateString = dateParts.join("-");
        if (timeParts.length) dateString += (dateString ? " " : "") + timeParts.join(":");

        const result: DateTimePickerResult = {
            date: new Date(d.getTime()),
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            day: d.getDate(),
            hour: d.getHours(),
            minute: d.getMinutes(),
            second: d.getSeconds(),
            dateString,
        };

        this.node.emit('confirm', result);
        this.hide();
    }

    private _onCancel(): void {
        this.node.emit('cancel');
        this.hide();
    }
}
