import {
    _decorator, Component, Node, UITransform, Label, Mask, ScrollView,
    Color, Vec2, UIOpacity, CCInteger, CCFloat,
} from "cc";

const { ccclass, property, menu } = _decorator;

// 滚轮手感参数（统一在这里调节）
// 说明：
// 1. 越短越“干脆”，越长越“柔和”
// 2. 推荐优先调 WHEEL_SNAP_DURATION / WHEEL_SNAP_UNLOCK_DURATION
// 3. 再调 WHEEL_SCROLL_BRAKE 影响“滑行停止”速度
const WHEEL_SCROLL_BRAKE = 0.82;
// ScrollView 回弹耗时（拖到边界时的回弹速度）
const WHEEL_BOUNCE_DURATION = 0.18;
// 代码主动调用 setIndex 时的滚动时长
const WHEEL_SET_INDEX_DURATION = 0.2;
// setIndex 动画后，解除 _snapping 锁的时间
const WHEEL_SET_INDEX_UNLOCK_DURATION = 0.22;
// setIndex 无动画时，最短锁定时间（用于等一帧刷新）
const WHEEL_SET_INDEX_UNLOCK_DURATION_NO_ANIM = 0.01;
// 手指抬起后，吸附到最近项的动画时长
const WHEEL_SNAP_DURATION = 0.12;
// 吸附动画后，解除 _snapping 锁的时间
const WHEEL_SNAP_UNLOCK_DURATION = 0.14;

/**
 * 单列滚轮选择器（iOS 风格）
 *
 * 特点：
 * 1. 纯 TS 实现，基于 ScrollView 惯性滚动 + 松手自动吸附，全平台通用（Web / Android / iOS / 小游戏）
 * 2. 运行时自建节点结构（ScrollView + Mask + 动态 Label），预制体只需一个挂载本组件的空节点
 * 3. 数据驱动：setItems(string[]) 即可填充，selectedColor / normalColor 高亮居中项
 *
 * 用法：
 * ```ts
 * const col = node.getComponent(WheelColumn);
 * col.setChangeCallback((idx) => console.log("选中", idx));
 * col.setItems(["2024", "2025", "2026"], 2);
 * ```
 */
@ccclass('WheelColumn')
@menu('Game/UI/WheelColumn（滚轮列）')
export class WheelColumn extends Component {
    @property({ type: CCFloat, tooltip: "每项高度（像素）" })
    itemHeight: number = 66;

    @property({ type: CCInteger, tooltip: "可见行数（建议为奇数）" })
    visibleCount: number = 5;

    @property({ type: CCInteger, tooltip: "字号" })
    fontSize: number = 40;

    @property({ type: Color, tooltip: "选中项颜色" })
    selectedColor: Color = new Color(51, 51, 51, 255);

    @property({ type: Color, tooltip: "未选中项颜色" })
    normalColor: Color = new Color(170, 170, 170, 255);

    @property({ type: CCFloat, tooltip: "两侧最小缩放（0~1）" })
    minScale: number = 0.82;

    /** ScrollView 组件 */
    private _scrollView: ScrollView = null!;
    /** 内容容器 */
    private _content: Node = null!;
    /** 数据 */
    private _items: string[] = [];
    /** 复用的 item 节点 */
    private _itemNodes: Node[] = [];
    /** 是否已构建结构 */
    private _built: boolean = false;
    /** 当前选中索引 */
    private _index: number = 0;
    /** 是否正在程序化吸附（用于屏蔽 SCROLL_ENDED 回调） */
    private _snapping: boolean = false;
    /** 选中变化回调 */
    private _onChange: ((index: number) => void) | null = null;

    onLoad() {
        this._build();
    }

    onDestroy() {
        if (this._scrollView && this._scrollView.node) {
            this._scrollView.node.off(ScrollView.EventType.SCROLLING, this._onScrolling, this);
            this._scrollView.node.off(ScrollView.EventType.SCROLL_ENDED, this._onScrollEnded, this);
        }
    }

    // ==================== 公共接口 ====================

    /** 注册选中变化回调（仅用户滑动结束时触发，程序化 setItems/setIndex 不触发） */
    setChangeCallback(cb: (index: number) => void): void {
        this._onChange = cb;
    }

    /** 设置数据并定位到指定索引 */
    setItems(items: string[], index: number = 0): void {
        this._items = items ? items.slice() : [];
        if (!this._built) this._build();
        this._rebuildItems();
        this.setIndex(index, false);
        // 内容布局可能延后一帧生效，下一帧再校正一次位置
        this.scheduleOnce(() => this.setIndex(this._index, false), 0);
    }

    /** 滚动定位到指定索引 */
    setIndex(index: number, animated: boolean = true): void {
        const count = this._items.length;
        if (count === 0 || !this._scrollView) return;
        index = Math.max(0, Math.min(count - 1, index));
        this._index = index;
        // 进入程序化滚动阶段，避免触发 _onScrollEnded 的二次吸附
        this._snapping = true;
        this._scrollView.scrollToOffset(new Vec2(0, index * this.itemHeight), animated ? WHEEL_SET_INDEX_DURATION : 0);
        this.scheduleOnce(() => { this._snapping = false; this._updateVisual(); }, animated ? WHEEL_SET_INDEX_UNLOCK_DURATION : WHEEL_SET_INDEX_UNLOCK_DURATION_NO_ANIM);
        this._updateVisual();
    }

    /** 获取当前选中索引 */
    getIndex(): number {
        if (!this._scrollView) return this._index;
        const off = this._scrollView.getScrollOffset();
        const idx = Math.round(Math.abs(off.y) / this.itemHeight);
        return Math.max(0, Math.min(this._items.length - 1, idx));
    }

    /** 获取当前选中文本 */
    getValue(): string {
        const i = this.getIndex();
        return this._items[i] ?? "";
    }

    // ==================== 内部构建 ====================

    private _colWidth(): number {
        const ut = this.getComponent(UITransform);
        return ut && ut.width ? ut.width : 120;
    }

    private _viewHeight(): number {
        return this.visibleCount * this.itemHeight;
    }

    private _build(): void {
        if (this._built) return;
        this._built = true;

        const w = this._colWidth();
        const h = this._viewHeight();

        const selfUT = this.getComponent(UITransform) || this.addComponent(UITransform);
        selfUT.setContentSize(w, h);

        // ScrollView 容器
        const sv = new Node('sv');
        this.node.addChild(sv);
        sv.addComponent(UITransform).setContentSize(w, h);

        // view + 裁剪遮罩
        const viewNode = new Node('view');
        sv.addChild(viewNode);
        viewNode.addComponent(UITransform).setContentSize(w, h);
        const mask = viewNode.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;

        // content
        const content = new Node('content');
        viewNode.addChild(content);
        const contentUT = content.addComponent(UITransform);
        contentUT.setAnchorPoint(0.5, 1);
        contentUT.setContentSize(w, h);
        content.setPosition(0, h / 2, 0);
        this._content = content;

        // ScrollView 组件
        const scroll = sv.addComponent(ScrollView);
        scroll.content = content;
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.inertia = true;
        scroll.brake = WHEEL_SCROLL_BRAKE;
        scroll.elastic = true;
        scroll.bounceDuration = WHEEL_BOUNCE_DURATION;
        this._scrollView = scroll;

        scroll.node.on(ScrollView.EventType.SCROLLING, this._onScrolling, this);
        scroll.node.on(ScrollView.EventType.SCROLL_ENDED, this._onScrollEnded, this);

        if (this._items.length) this._rebuildItems();
    }

    private _rebuildItems(): void {
        const w = this._colWidth();
        const count = this._items.length;

        // 按需扩充节点池
        while (this._itemNodes.length < count) {
            const n = new Node('item');
            n.addComponent(UITransform).setContentSize(w, this.itemHeight);
            n.addComponent(UIOpacity);
            const lbl = n.addComponent(Label);
            lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
            lbl.verticalAlign = Label.VerticalAlign.CENTER;
            lbl.overflow = Label.Overflow.CLAMP;
            this._content.addChild(n);
            this._itemNodes.push(n);
        }

        const pad = (this._viewHeight() - this.itemHeight) / 2;
        // 填充 / 隐藏
        for (let i = 0; i < this._itemNodes.length; i++) {
            const n = this._itemNodes[i];
            if (i < count) {
                n.active = true;
                n.getComponent(UITransform)!.setContentSize(w, this.itemHeight);
                const lbl = n.getComponent(Label)!;
                lbl.string = this._items[i];
                lbl.fontSize = this.fontSize;
                lbl.lineHeight = this.fontSize + 6;
                n.setPosition(0, -(pad + this.itemHeight / 2 + i * this.itemHeight), 0);
            } else {
                n.active = false;
            }
        }

        // content 高度
        const contentH = count * this.itemHeight + pad * 2;
        this._content.getComponent(UITransform)!.setContentSize(w, contentH);

        this._updateVisual();
    }

    private _onScrolling(): void {
        this._updateVisual();
    }

    private _onScrollEnded(): void {
        if (this._snapping) return;
        this._snap();
    }

    /** 吸附到最近项 */
    private _snap(): void {
        const count = this._items.length;
        if (count === 0 || !this._scrollView) return;
        const off = this._scrollView.getScrollOffset();
        // 根据当前偏移计算最近索引
        let idx = Math.round(Math.abs(off.y) / this.itemHeight);
        idx = Math.max(0, Math.min(count - 1, idx));

        // 执行一次短动画吸附，手感更接近 iOS 滚轮
        this._snapping = true;
        this._scrollView.scrollToOffset(new Vec2(0, idx * this.itemHeight), WHEEL_SNAP_DURATION);
        this.scheduleOnce(() => { this._snapping = false; this._updateVisual(); }, WHEEL_SNAP_UNLOCK_DURATION);

        const changed = idx !== this._index;
        this._index = idx;
        this._updateVisual();
        if (changed && this._onChange) this._onChange(idx);
    }

    /** 根据当前偏移刷新每一项的颜色 / 缩放 / 透明度 */
    private _updateVisual(): void {
        if (!this._scrollView) return;
        const off = this._scrollView.getScrollOffset();
        const f = Math.abs(off.y) / this.itemHeight;
        const count = this._items.length;
        for (let i = 0; i < count; i++) {
            const n = this._itemNodes[i];
            if (!n || !n.active) continue;
            const d = Math.abs(i - f);
            const t = Math.min(d, 1);
            // 颜色
            const c = new Color();
            Color.lerp(c, this.selectedColor, this.normalColor, t);
            n.getComponent(Label)!.color = c;
            // 缩放
            const s = 1 - (1 - this.minScale) * t;
            n.setScale(s, s, 1);
            // 透明度
            const op = n.getComponent(UIOpacity);
            if (op) op.opacity = Math.round(255 * (1 - 0.55 * Math.min(d / 2, 1)));
        }
    }
}
