# CCDateTimeSelector

一个适用于 Cocos Creator 3.x 的 iOS 风格日期时间选择器组件。

## ✨ 特性

- 🎯 **iOS 风格滚轮** - 流畅的惯性滚动和自动吸附效果
- 🎨 **纯代码实现** - 无图片资源依赖，运行时动态构建 UI
- 📱 **全平台通用** - 支持 Web / Android / iOS / 小游戏等所有平台
- ⚙️ **高度可配置** - 支持年/月/日/时/分/秒自由组合显示
- 🎭 **日期范围限制** - 支持设置最小和最大可选日期
- 🌐 **国际化友好** - 支持中英文单位显示切换
- 📦 **开箱即用** - 提供预制体和示例脚本，快速集成

## 📋 环境要求

- Cocos Creator 3.8.8 或更高版本
- TypeScript

## 🚀 快速开始

### 安装

#### 方式一：直接复制（推荐）

1. 下载或克隆本项目
2. 将 `assets` 目录下的以下文件复制到你的项目中：
   - `assets/script/DateTimePicker.ts` - 主组件
   - `assets/script/WheelColumn.ts` - 滚轮列组件
   - `assets/prefab/dateTimePicker.prefab` - 选择器预制体
   - `assets/prefab/wheelColumn.prefab` - 滚轮预制体（可选）

#### 方式二：导入整个项目

1. 下载本项目
2. 在 Cocos Creator 中打开项目
3. 将需要的文件复制到你的项目中

### 基础用法

#### 1. 在场景中使用预制体

```typescript
import { _decorator, Component, instantiate, Node, Prefab } from 'cc';
import { DateTimePicker, DateTimePickerResult } from './DateTimePicker';

const { ccclass, property } = _decorator;

@ccclass('YourComponent')
export class YourComponent extends Component {
    @property(Prefab)
    dateTimePickerPrefab: Prefab = null!;

    showDatePicker() {
        // 实例化预制体
        const node = instantiate(this.dateTimePickerPrefab);
        node.parent = this.node.scene.getChildByName("Canvas");

        const picker = node.getComponent(DateTimePicker)!;

        // 配置选项
        picker.setOptions({
            showYear: true,
            showMonth: true,
            showDay: true,
            showHour: false,
            showMinute: false,
            showSecond: false,
            title: "选择出生日期",
            unit: true,  // 显示中文单位
        });

        // 设置默认日期
        picker.setDate(new Date());

        // 监听确认事件
        node.on("confirm", (result: DateTimePickerResult) => {
            console.log("选择的日期:", result.dateString);
            console.log("详细信息:", result);
            node.destroy();  // 销毁选择器
        });

        // 监听取消事件
        node.on("cancel", () => {
            console.log("用户取消了选择");
            node.destroy();
        });

        // 显示选择器
        picker.show();
    }
}
```

#### 2. 使用测试组件

项目中提供了 `DateTimePickerTest` 组件，可以快速测试选择器功能：

1. 在场景中创建一个空节点
2. 添加 `DateTimePickerTest` 组件
3. 将 `dateTimePicker.prefab` 拖到 `dateTimePickerPrefab` 属性
4. 运行场景，点击节点即可弹出选择器

## 📚 API 文档

### DateTimePicker 主组件

#### 配置选项（DateTimePickerOptions）

```typescript
interface DateTimePickerOptions {
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

    /** 最大可选日期（默认当前年 +50） */
    maxDate?: Date;

    /** 标题文本 */
    title?: string;

    /** 是否显示中文单位（年/月/日/时/分/秒），默认 true */
    unit?: boolean;
}
```

#### 主要方法

```typescript
/** 配置选择器选项 */
setOptions(opts: DateTimePickerOptions): void;

/** 设置当前选中日期 */
setDate(date: Date): void;

/** 获取当前选中日期 */
getDate(): Date;

/** 显示选择器 */
show(): void;

/** 隐藏选择器 */
hide(): void;
```

#### 事件

```typescript
// 确认选择
node.on("confirm", (result: DateTimePickerResult) => {
    // result.date - Date 对象
    // result.year - 年
    // result.month - 月 (1-12)
    // result.day - 日
    // result.hour - 时
    // result.minute - 分
    // result.second - 秒
    // result.dateString - 格式化字符串 "2024-01-15" 或 "2024-01-15 10:30:00"
});

// 取消选择
node.on("cancel", () => {
    // 用户点击了取消按钮或背景遮罩
});
```

#### 属性设置（编辑器）

在属性检查器中可以直接设置以下属性：

- **itemHeight** - 每项高度（像素），默认 66
- **visibleCount** - 可见行数（建议奇数），默认 5
- **panelWidth** - 面板宽度，默认 690
- **panelColor** - 面板背景色
- **maskColor** - 遮罩颜色
- **titleColor** - 标题文字颜色
- **confirmColor** - 确定按钮文字颜色
- **cancelColor** - 取消按钮文字颜色
- **title** - 标题文本，默认 "选择日期"
- **confirmText** - 确定按钮文本，默认 "Done"
- **cancelText** - 取消按钮文本，默认 "Cancel"

### WheelColumn 滚轮列组件

如果你需要自定义单列滚轮选择器，可以直接使用 `WheelColumn` 组件：

```typescript
import { WheelColumn } from './WheelColumn';

// 获取组件
const wheel = node.getComponent(WheelColumn);

// 设置选项
wheel.setItems(["选项1", "选项2", "选项3"], 0);

// 设置选中项
wheel.setIndex(2);

// 获取当前选中索引
const index = wheel.getIndex();

// 获取当前选中文本
const value = wheel.getValue();

// 监听选择变化
wheel.setChangeCallback((index: number) => {
    console.log("选中了:", index);
});
```

## 📖 示例场景

### 示例 1：只选择日期

```typescript
picker.setOptions({
    showYear: true,
    showMonth: true,
    showDay: true,
    showHour: false,
    showMinute: false,
    showSecond: false,
    title: "选择日期",
});
```

### 示例 2：选择日期和时间

```typescript
picker.setOptions({
    showYear: true,
    showMonth: true,
    showDay: true,
    showHour: true,
    showMinute: true,
    showSecond: false,
    title: "选择日期时间",
});
```

### 示例 3：只选择时间

```typescript
picker.setOptions({
    showYear: false,
    showMonth: false,
    showDay: false,
    showHour: true,
    showMinute: true,
    showSecond: true,
    title: "选择时间",
});
```

### 示例 4：限制日期范围

```typescript
picker.setOptions({
    showYear: true,
    showMonth: true,
    showDay: true,
    minDate: new Date(2020, 0, 1),  // 最小日期：2020-01-01
    maxDate: new Date(2030, 11, 31), // 最大日期：2030-12-31
    title: "选择日期",
});
```

### 示例 5：隐藏中文单位

```typescript
picker.setOptions({
    showYear: true,
    showMonth: true,
    showDay: true,
    unit: false,  // 不显示"年月日"等中文单位
    title: "Select Date",
});
```

## 🎯 注意事项

1. **层级管理** - 确保选择器实例化到 Canvas 节点下，以保证正确的渲染层级
2. **内存管理** - 使用完毕后记得调用 `node.destroy()` 销毁选择器节点
3. **日期有效性** - 设置的日期会被自动限制在 `minDate` 和 `maxDate` 范围内
4. **大小月处理** - 组件会自动处理大小月和闰年，当切换年/月时会自动调整日期

## 🔧 自定义样式

### 修改颜色

在编辑器中直接修改 DateTimePicker 组件的属性，或者在代码中修改：

```typescript
// 面板背景色
picker.panelColor = new Color(255, 255, 255, 255);

// 遮罩颜色
picker.maskColor = new Color(0, 0, 0, 128);

// 标题颜色
picker.titleColor = new Color(51, 51, 51, 255);

// 确定按钮颜色
picker.confirmColor = new Color(0, 122, 255, 255);

// 取消按钮颜色
picker.cancelColor = new Color(150, 150, 150, 255);
```

### 修改尺寸

```typescript
// 每项高度
picker.itemHeight = 66;

// 可见行数
picker.visibleCount = 5;

// 面板宽度
picker.panelWidth = 690;
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 📮 联系方式

如有问题或建议，欢迎提交 Issue。

## 🙏 致谢

- 灵感来源于 iOS UIPickerView
- 基于 Cocos Creator 强大的引擎能力实现