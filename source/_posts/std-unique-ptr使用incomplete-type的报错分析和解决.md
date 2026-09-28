---
title: 'std::unique_ptr使用incomplete type的报错分析和解决'
date: 2020-11-30 11:31:17
tags:
    - C/C++
    - STL
---

`Pimpl`(Pointer to implementation)很多同学都不陌生，但是从原始指针升级到C++11的独占指针`std::unique_ptr`时，会遇到一个`incomplete type`的报错，本文来分析一下报错的原因以及分享几种解决方法~

<!-- more -->

## 问题现象

首先举一个传统C++中的`Pimpl`的例子

```c++
// widget.h

// 预先声明
class Impl;

class Widget
{
    Impl * pImpl;
};
```

很简单，没什么问题，但是使用的是原始指针，现在我们升级到`std::unique_ptr`

```c++
// widget.h

// 预先声明
class Impl;

class Widget
{
    std::unique_ptr<Impl> pImpl;
};
```

很简单的一次升级，而且也能通过编译，看似也没问题，但当你创建一个`Widget`的实例

```C++
// pimpl.cpp

#include "widget.h"

Widget w;
```

这时候，问题来了

```bash
$ g++ pimpl.cpp
In file included from /usr/include/c++/9/memory:80,
    from widget.h:1,
    from pimpl.cpp:1:
/usr/include/c++/9/bits/unique_ptr.h:
    In instantiation of ‘void std::default_delete<_Tp>::operator()(_Tp*) const [with _Tp = Impl]’:
/usr/include/c++/9/bits/unique_ptr.h:292:17:
    required from ‘std::unique_ptr<_Tp, _Dp>::~unique_ptr() [with _Tp = Impl; _Dp = std::default_delete<Impl>]’
widget.h:5:7:   required from here
/usr/include/c++/9/bits/unique_ptr.h:79:16: error: invalid application of ‘sizeof’ to incomplete type ‘Impl’
79 |  static_assert(sizeof(_Tp)>0,
   |                ^~~~~~~~~~~
```

## 原因分析

从报错我们可以看出，`std::unique_ptr`中需要静态检测类型的大小`static_assert(sizeof(Impl) > 0)`，但是我们的`Impl`是一个预先声明的类型，是`incomplete type`，也就没法计算，所以导致报错。

想要知道怎么解决，首先需要知道`std::unique_ptr`为啥需要计算这个，我们来看一下STL中相关的源码，从报错中得知是`unique_ptr.h`的292行，调用了79行，我们把前后相关源码都粘出来（来自`g++ 9.3.0`中的实现）

```c++
// 292行附近

      /// Destructor, invokes the deleter if the stored pointer is not null.
      ~unique_ptr() noexcept
      {
	static_assert(__is_invocable<deleter_type&, pointer>::value,
		      "unique_ptr's deleter must be invocable with a pointer");
	auto& __ptr = _M_t._M_ptr();
	if (__ptr != nullptr)
// 292行在这里
	  get_deleter()(std::move(__ptr));
	__ptr = pointer();
      }

// 79行附近

  /// Primary template of default_delete, used by unique_ptr
  template<typename _Tp>
    struct default_delete
    {
      /// Default constructor
      constexpr default_delete() noexcept = default;

      /** @brief Converting constructor.
       *
       * Allows conversion from a deleter for arrays of another type, @p _Up,
       * only if @p _Up* is convertible to @p _Tp*.
       */
      template<typename _Up, typename = typename
	       enable_if<is_convertible<_Up*, _Tp*>::value>::type>
        default_delete(const default_delete<_Up>&) noexcept { }

      /// Calls @c delete @p __ptr
      void
      operator()(_Tp* __ptr) const
      {
	static_assert(!is_void<_Tp>::value,
		      "can't delete pointer to incomplete type");
// 79行在这里
	static_assert(sizeof(_Tp)>0,
		      "can't delete pointer to incomplete type");
	delete __ptr;
      }
    };
```

`std::unique_ptr`中的析构函数，调用了默认的删除器`default_delete`，而`default_delete`中检查了`Impl`，其实就算`default_delete`中不检查，到下一步`delete __ptr;`，还是会出问题，因为不完整的类型无法被`delete`。

## 解决方法

原因已经知道了，那么解决方法就呼之欲出了，这里提供三种解决方法：

- [方法一](#方法一)：改用`std::shared_ptr`
- [方法二](#方法二)：自定义删除器，将`delete pImpl`的操作，放到`widget.cpp`源文件中
- [方法三](#方法三)：仅声明`Widget`的析构函数，但不要在`widget.h`头文件中实现它

其中我最推荐方法三，它不改变代码需求，且仅做一点最小的改动，下面依次分析

### 方法一

**改用`std::shared_ptr`**

```c++
// widget.h

// 预先声明
class Impl;

class Widget
{
    std::shared_ptr<Impl> pImpl;
};
```

改完就能通过编译了，这种改法最简单。但是缺点也很明显：使用`shared_ptr`可能会改变项目的需求，`shared_ptr`也会带来额外的性能开销，而且违反了“尽可能使用`unique_ptr`而不是`shared_ptr`”的原则（当然这个原则是我编的，哈哈）

那为什么`unique_ptr`不能使用预先声明的`incomplete type`，但是`shared_ptr`却可以？

因为对于`unique_ptr`而言，删除器是类型的一部分：

```c++
  template<typename _Tp, typename _Dp>
    class unique_ptr<_Tp[], _Dp>
```

这里的`_Tp`是`element_type`，`_Dp`是`deleter_type`

而`shared_ptr`却不是这样：

```c++
  template<typename _Tp>
    class shared_ptr : public __shared_ptr<_Tp>
```

那为什么`unique_ptr`的删除器是类型的一部分，而`shared_ptr`不是呢？

答案是设计如此！哈哈，说了句废话。具体来说，删除器不是类型的一部分，使得你可以对同一种类型的`shared_ptr`，使用不同的自定义删除器

```c++
auto my_deleter = [](Impl * p) {...};

std::shared_ptr<Impl> w1(new Impl, my_deleter);
std::shared_ptr<Impl> w2(new Impl); // default_deleter

w1 = w2; // It's OK!
```

看到了么，这里的两个智能指针`w1`和`w2`，虽然使用了不同的删除器，但它们是同一种类型，可以相互进行赋值等等操作。而`unique_ptr`却不能这么玩

```c++
auto my_deleter = [](Impl * p) {...};

std::unique_ptr<Impl, decltype(my_deleter)> w1(new Impl, my_deleter);
std::unique_ptr<Impl> w2(new Impl); // default_deleter

// w1的类型是 std::unique_ptr<Impl, lambda []void (Impl *p)->void>
// w2的类型是 std::unique_ptr<Impl, std::default_delete<Impl>>

w1 = std::move(w2); // 错误！类型不同，没有重载operator=
```

道理我都明白了，那为什么要让这两种智能指针有这样的区别啊？

答案还是设计如此！哈哈，具体来说`unique_ptr`本身就只是对原始指针的简单封装，这样做不会带来额外的性能开销。而`shared_ptr`的实现提高了灵活性，但却进一步增大了性能开销。针对不同的使用场景所以有这样的区别。

### 方法二

**自定义删除器，将`delete pImpl`的操作，放到`widget.cpp`源文件中**

```c++
// widget.h

// 预先声明
class Impl;

class Widget
{
    struct ImplDeleter final
    {
        constexpr ImplDeleter() noexcept = default;
        void operator()(Impl *p) const;
    };
    std::unique_ptr<Impl, ImplDeleter> pImpl = nullptr;
};
```

然后在源文件`widget.cpp`中

```c++
#include "widget.h"
#include "impl.h"

void Widget::ImplDeleter::operator()(Impl *p) const
{
    delete p;
}
```

这种方法改起来也不复杂，但是弊端也很明显，`std::make_unique`没法使用了，只能自己手动`new`，直接看源码吧

```c++
  template<typename _Tp, typename... _Args>
    inline typename _MakeUniq<_Tp>::__single_object
    make_unique(_Args&&... __args)
    { return unique_ptr<_Tp>(new _Tp(std::forward<_Args>(__args)...)); }
```

看出问题在哪了么？这里返回的是默认删除器类型的`unique_ptr`，即`std::unique_ptr<Impl, std::default_delete<Impl>>`，如[方法一](#方法一)中所说，不同删除器类型的`unique_ptr`没法相互赋值，也就是说：

```c++
pImpl = std::make_unique<Impl>(); // 错误！类型不同，没有重载operator=

pImpl = std::unique_ptr<Impl, ImplDeleter>(new Impl); // 正确！每次你都要写这么一大串
```

当然你也可以实现一个`make_impl`，并且`using`一下这个很长的类型，比如：

```c++
using unique_impl = std::unique_ptr<Impl, ImplDeleter>;

template<typename... Ts>
unique_impl make_impl(Ts && ...args)
{
    return unique_impl(new Impl(std::forward<Ts>(args)...));
}

// 调用
pImpl = make_impl();
```

看似还凑合，但总的来说，这样做还是感觉很麻烦。并且有一个很头疼的问题：`make_impl`作为函数模板，没法声明和定义分离，而且其中用到了`new`，需要完整的`Impl`类型。所以，你只能把这一段模板函数写在源文件中，emmm，总感觉不太对劲。

### 方法三

**仅声明`Widget`的析构函数，但不要在`widget.h`头文件中实现它**

```c++
// widget.h

// 预先声明
class Impl;

class Widget
{
    Widget();
    ~Widget();  // 仅声明

    std::unique_ptr<Impl> pImpl;
};
```

```c++
// widget.cpp
#include "widget.h"
#include "impl.h"

Widget::Widget()
    : pImpl(nullptr)
{}

Widget::~Widget() = default;    // 在这里定义
```

这样就解决了！是不是出乎意料的简单！并且你也可以正常的使用`std::make_unique`来进行赋值。唯一的缺点就是你没法在头文件中初始化`pImpl`了

但也有别的问题，因为不光是析构函数中需要析构`std::unique_ptr`，还有别的也需要，比如移动构造、移动运算符等。所以在移动构造、移动运算符中，你也会遇到同样的编译错误。解决方法也很简单，同上面一样：

```c++
// widget.h

// 预先声明
class Impl;

class Widget
{
    Widget();
    ~Widget();

    Widget(Widget && rhs);  // 同析构函数，仅声明
    Widget& operator=(Widget&& rhs);

    std::unique_ptr<Impl> pImpl;
};
```

```c++
// widget.cpp
#include "widget.h"
#include "impl.h"

Widget::Widget()
    : pImpl(nullptr)
{}

Widget::~Widget() = default;

Widget::Widget(Widget&& rhs) = default;     //在这里定义
Widget& Widget::operator=(Widget&& rhs) = default;
```

搞定！

## 参考资料

- [当使用Pimpl惯用法，请在实现文件中定义特殊成员函数 - 
《Effective Modern Cpp》](https://github.com/kelthuzadx/EffectiveModernCppChinese/blob/master/4.SmartPointers/item22.md)
- [std::unique_ptr with an incomplete type won't compile - Stack Overflow](https://stackoverflow.com/questions/9954518/stdunique-ptr-with-an-incomplete-type-wont-compile/9954553)
