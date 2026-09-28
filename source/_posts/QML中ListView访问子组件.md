---
title: QML中ListView访问子组件
date: 2018-06-12 17:56:59
tags:
    - QML
---

老规矩先上结论：已经创建出来的 delegate 在`contentItem.children`里，但这个下标不是 model 的 index

```js
var children = listview.contentItem.children
```

<!-- more -->

## 前言

写QML项目难免经常要用到[`ListView`](https://doc.qt.io/qt-5.9/qml-qtquick-listview.html)，可是`ListView`却不像`Repeater`一样拥有`itemAt(index)`这样的方法，只有`itemAt(real x, real y)`，需要通过坐标值来得到子组件，而作为可以滑动的列表，坐标还得实时计算，这也太蠢了，我明明只是想遍历当前这些子组件而已！查了很多资料终于找到了答案，用它的`contentItem`（基类`QQuickItem`）拿子节点，而不是在`ListView`自己的接口里找

```js
var children = listview.contentItem.children
```

## 举个简单的例子

```js
ListView {
    id: listview
    model: 10
    delegate: TextField {
        function getText() {
            return text;
        }
    }
    function getAllText() {
        var allText = [];
        var children = listview.contentItem.children;
        for (var i = 0; i != children.length; ++i) {
            if (typeof children[i].getText !== "function") {
                continue;
            }
            allText.push(children[i].getText());
        }
        return allText;
    }
}
```

## 要注意的一些问题

`children[i]`不能当成第 i 条 model。`ListView`只会创建可见区域加上`cacheBuffer`里的 delegate，滑出去的会被销毁或者复用，所以这里遍历不到完整列表。`contentItem`下面也不只有 delegate，highlight、header、footer 都会混在里面，直接`children[i].getText()`会踩到没有这个函数的对象。

`spacing`也不会往 children 里插`Item`，它只是两项之间空出的距离。之前把下标对不上理解成 spacing 塞了占位节点，这个是错的。

## 利用model的方法

### 2018-07-07更新

如果要的是 model 里的数据，而不是 delegate 上的函数，就不要走`children`。`for (var i in listview.model)`拿到的`i`是键，`i["xxx"]`并不是某一行；整数 model 也没有字段可读。`ListModel`用`get`：

```js
for (var i = 0; i < listview.count; ++i) {
    allText.push(listview.model.get(i).xxx);
}
```
