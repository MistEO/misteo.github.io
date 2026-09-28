---
title: QML中ListView访问子组件
date: 2018-06-12 17:56:59
tags:
    - QML
---

老规矩先上结论，通过`contentItem.children`访问即可

```js
var obj = listview.contentItem.children[index]
```

<!-- more -->

## 前言

写QML项目难免经常要用到[`ListView`](https://doc-snapshots.qt.io/qt5-5.9/qml-qtquick-listview.html)，可是`ListView`却不像`Repeater`一样拥有`itemAt(index)`这样的方法，只有`itemAt(real x, real y)`，需要通过坐标值来得到子组件，而作为可以滑动的列表，坐标还得实时计算，这也太蠢了，我明明只是想遍历所有子组件而已！查了很多资料终于找到了答案，使用其基类`QQuickItem`里的方法即可，而不是`ListView`里面的，即上文摘要中提到的`contentItem`

```js
var obj = listview.contentItem.children[index]
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
            allText.push(children[i].getText());
        }
        return allText;
    }
}
```

## 要注意的一些问题

### spacing带来的问题

不知道`spacing`具体的实现是什么，类似于给列表加上一些有长宽的`Item`或者什么的，这都不是重点，重点是加上这些`Item`之后，循环访问会出现问题，所以需要判断一下，举个例子：

```js
var children = listview.contentItem.children;
for (var i = 0; i !== children.length; ++i) {
    if (typeof children[i].getText !== "function") {
        // 或者 typeof children[i].getText === "undefined"
        continue;
    }
    allText.push(children[i].getText());
}
```

当然也可能有更好的方法，想到再补充吧

## 利用model的方法

### 2018-07-07更新

临时想到的方法，还没有进一步验证，可能需要加一些处理才能使用，仅供参考

```js
for (var i in listview.model) {
    allText.push(i["xxx"]);
}
```
