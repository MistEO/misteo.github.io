---
title: 安全的字符串拷贝strcpy_s的实现与理解
date: 2020-10-21 15:29:00
tags:
    - C/C++
    - STL
    - 算法
---

在C标准库中提供了字符串拷贝函数`strcpy`，而微软则为为它提供了一个更安全的版本`strcpy_s`，其函数原型为

```c++
errno_t __cdecl strcpy_s(
    char*       _Destination,
    rsize_t     _SizeInBytes,
    char const* _Source
    );
```

分享下它的实现和一些个人理解

<!-- more -->

## 源码展示

### 标准`strcpy`的实现

```c++
// from gcc-4.8.5
extern void abort (void);
extern int inside_main;

__attribute__ ((__noinline__))
char *
strcpy (char *d, const char *s)
{
  char *r = d;
#if defined __OPTIMIZE__ && !defined __OPTIMIZE_SIZE__
  if (inside_main)
    abort ();
#endif
  while ((*d++ = *s++));
  return r;
}

// 简化一下
char *strcpy (char *d, const char *s)
{
  char *r = d;
  while ((*d++ = *s++));
  return r;
}
```

~~没什么好说的，懂得都懂（笑~~

逐地址拷贝，当`*d == '\0'`时，while循环退出结束拷贝，网上搜strcpy实现应该能找到很多详解，不赘述了

### 微软`strcpy_s`的实现

```c++
// from C:\Program Files (x86)\Microsoft Visual Studio 10.0\VC\crt\src\tcscpy_s.inl

/***
*tcscpy_s.inl - general implementation of _tcscpy_s
*
*       Copyright (c) Microsoft Corporation. All rights reserved.
*
*Purpose:
*       This file contains the general algorithm for strcpy_s and its variants.
*
****/

_FUNC_PROLOGUE
errno_t __cdecl _FUNC_NAME(_CHAR *_DEST, size_t _SIZE, const _CHAR *_SRC)
{
    _CHAR *p;
    size_t available;

    /* validation section */
    _VALIDATE_STRING(_DEST, _SIZE);
    _VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);

    p = _DEST;
    available = _SIZE;
    while ((*p++ = *_SRC++) != 0 && --available > 0)
    {
    }

    if (available == 0)
    {
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);
    }
    _FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);
    _RETURN_NO_ERROR;
}
```

首先明确一点，多出来的参数`size_t _SIZE`需要传入目的地址可用长度，即`_DEST`的可用长度

实现中多了几个宏定义，我们先**猜一下**他们是干嘛的，然后带着疑问往下看。

不感兴趣的同学也可以跳过这一章，直接看后面的[分析结论](#分析结论)

## 详细分析过程

（*注：以下为猜测内容，与实际可能有较大差异，正确解释请接着往后看每个宏定义的详细分析*）

### 总体猜测

- `_VALIDATE_STRING`：应该是验证字符串的合法性，是否为NULL，失败可能会直接return错误码；传入SIZE可能还会判断目的地址是否有这么长？但是这个咋判断呢，想不通
- `_VALIDATE_POINTER_RESET_STRING`：看不懂，不过既然是VALIDATE（验证），估计还是做一些什么检查之类的吧，但是后面为啥又RESET呢？
- `_RESET_STRING`：应该是将字符串重置，重置为NULL么？
- `_RETURN_BUFFER_TOO_SMALL`：应该就是return了一个错误码吧，可能还包含错误信息啥的？
- `_FILL_STRING`：应该是将字符串剩余部分填充为NULL？
- `_RETURN_NO_ERROR`：应该就是`return 0`。

这样再看一遍代码下来，整体逻辑还是比较清晰的：

1. 先两个`_VALIDATE`宏，验证目的字符串和源字符串的合法性
2. 开始逐字符拷贝，如果正常拷到`'\0'`，或者`available`跑完了，就停止
3. 如果2.中是`available`跑完了，说明SRC的长度超过了SIZE，即超过了目的字符串最大可用长度。拷贝失败了，重置DEST，整理错误信息，return错误码。
4. 正常拷到`'\0'`，就把DEST剩余的后半部分`[_SIZE - available + 1, _Size)`全填充为某个比较安全的值。
5. return 0 结束。

下面逐个分析下这些宏，为了便于理解，我整理了一下，不要在意定义的先后顺序~

### `_VALIDATE_STRING`

```c++
_VALIDATE_STRING(_DEST, _SIZE);

// from internal_securecrt.h
#define _VALIDATE_STRING(_String, _Size) \
    _VALIDATE_STRING_ERROR((_String), (_Size), EINVAL)
```

得，套娃，我们接着看

```c++
// from internal_securecrt.h
#define _VALIDATE_STRING_ERROR(_String, _Size, _Ret) \
    _VALIDATE_RETURN((_String) != NULL && (_Size) > 0, EINVAL, (_Ret))

// from errno.h
#define EINVAL          22
```

似乎好理解一点了，如果不满足`(_String) != NULL && (_Size) > 0`，可能会报错并返回`EINVAL`，`EINVAL`就是errno的错误码`22`，表示非法参数。原来Size只是判断是否大于0啊，那看来前面猜测的判断DEST长度是猜错了，确实没法实现这个

但是`_VALIDATE_RETURN`的第二个和第三个参数都是`EINVAL`，又是干啥的？

```c++
// from internal.h
#ifndef _VALIDATE_RETURN
#define _VALIDATE_RETURN( expr, errorcode, retexpr )                           \
    {                                                                          \
        int _Expr_val=!!(expr);                                                \
        _ASSERT_EXPR( ( _Expr_val ), _CRT_WIDE(#expr) );                       \
        if ( !( _Expr_val ) )                                                  \
        {                                                                      \
            errno = errorcode;                                                 \
            _INVALID_PARAMETER(_CRT_WIDE(#expr) );                             \
            return ( retexpr );                                                \
        }                                                                      \
    }
#endif  /* _VALIDATE_RETURN */
```

首先看明白了上面的疑问，第一个参数`expr`是判断条件，第二个参数`errorcode`是赋值给errno的（不了解errno的同学可以自行搜一下），第三个参数`retexpr`是用来return的

然后我们接着来看套娃

```c++
// from crtdbg.h
#ifndef _DEBUG
    #ifndef _ASSERT_EXPR
        #define _ASSERT_EXPR(expr, msg) ((void)0)
    #endif  
#else // ^^^ !_DEBUG ^^^ // vvv _DEBUG vvv //

    // !! is used to ensure that any overloaded operators used to evaluate expr
    // do not end up at &&.
    #ifndef _ASSERT_EXPR
        #define _ASSERT_EXPR(expr, msg) \
            (void)(                                                                                     \
                (!!(expr)) ||                                                                           \
                (1 != _CrtDbgReportW(_CRT_ASSERT, _CRT_WIDE(__FILE__), __LINE__, NULL, L"%ls", msg)) || \
                (_CrtDbgBreak(), 0)                                                                     \
            )
    #endif
```

非Debug模式下，就什么也不做，直接转`((void)0)`；Debug模式下，`_CrtDbgReportW`是弹出对话框报错，`_CrtDbgBreak`是触发调试断点，这个扯远了，不再深度展开，有兴趣的同学再另外看下吧~

```c++
// from internal.h
#define _INVALID_PARAMETER(expr) _CALL_INVALID_PARAMETER(expr)

// from internal.h
#define _CALL_INVALID_PARAMETER(expr) _invalid_parameter(expr, __FUNCTIONW__, __FILEW__, __LINE__, 0)
```

`_INVALID_PARAMETER`说实话我真没太看明白在干嘛，继续追踪后来会到`invarg.c`中，套娃套的太多了，看不过来了。。获取了`__FUNCTION__`、`__LINE__`等，估计是记录错误，可能在VS的调试器等中有体现，有兴趣的同学也自行也就看下吧

#### 小结（-VALIDATE-STRING）

总结一下，就是检查`(_DEST != NULL && _Size > 0)`，不满足的话，赋值errno，并直接返回错误码，（_DEBUG模式下，还会弹窗提示，并触发调试断点）。简单实现如下

```c++
// Same like _VALIDATE_STRING(_DEST, _SIZE);
if (_DEST == NULL || _Size <= 0)
{
    errno = EINVAL;
    return EINVAL;
}
```

看完了第一个宏，想必对这些宏的套路也有一些了解，后面的就不每个这么详细展开了

### `_VALIDATE_POINTER_RESET_STRING`

```c++
_VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);

// from internal_securecrt.h
#define _VALIDATE_POINTER_RESET_STRING(_Pointer, _String, _Size) \
    _VALIDATE_POINTER_RESET_STRING_ERROR((_Pointer), (_String), (_Size), EINVAL)

// from internal_securecrt.h
#define _VALIDATE_POINTER_RESET_STRING_ERROR(_Pointer, _String, _Size, _Ret) \
    if ((_Pointer) == NULL) \
    { \
        _RESET_STRING((_String), (_Size)); \
        _VALIDATE_POINTER_ERROR_RETURN((_Pointer), EINVAL, (_Ret)) \
    }
```

如果`_SRC`为`NULL`，才进行`_RESET_STRING`和`_VALIDATE_POINTER_ERROR_RETURN`的操作，就是如果源字符串NULL，直接把目的字符串重置，然后返回验证一个什么值并返回

```c++
// from internal_securecrt.h
#define _RESET_STRING(_String, _Size) \
    *(_String) = 0; \
    _FILL_STRING((_String), (_Size), 1);

// from internal_securecrt.h
/* string resetting */
#define _FILL_STRING _SECURECRT__FILL_STRING

// from internal.h
#if _SECURECRT_FILL_BUFFER
#define _SECURECRT__FILL_STRING(_String, _Size, _Offset)                            \
    if ((_Size) != ((size_t)-1) && (_Size) != INT_MAX &&                            \
        ((size_t)(_Offset)) < (_Size))                                              \
    {                                                                               \
        memset((_String) + (_Offset),                                               \
            _SECURECRT_FILL_BUFFER_PATTERN,                                         \
            (_SECURECRT_FILL_BUFFER_THRESHOLD < ((size_t)((_Size) - (_Offset))) ?   \
                _SECURECRT_FILL_BUFFER_THRESHOLD :                                  \
                ((_Size) - (_Offset))) * sizeof(*(_String)));                       \
    }
#else  /* _SECURECRT_FILL_BUFFER */
#define _SECURECRT__FILL_STRING(_String, _Size, _Offset)
#endif  /* _SECURECRT_FILL_BUFFER */

// from internal.h
#ifdef _DEBUG
#define _SECURECRT_FILL_BUFFER 1
#else  /* _DEBUG */
#define _SECURECRT_FILL_BUFFER 0
#endif  /* _DEBUG */

// from corecrt.h, 0xFE = 254
#define _SECURECRT_FILL_BUFFER_PATTERN 0xFE

// from internal.h
#ifdef _DEBUG
#define _SECURECRT_FILL_BUFFER_THRESHOLD __crtDebugFillThreshold
#else  /* _DEBUG */
#define _SECURECRT_FILL_BUFFER_THRESHOLD ((size_t)0)
#endif  /* _DEBUG */

// from dbgheap.c
extern "C" size_t __crtDebugFillThreshold = SIZE_MAX;
```

这里比较巧妙，重置字符串，一般情况下仅将_DSET首个char的值赋值 `*(_DEST) = 0;`；DEBUG模式下才`_FILL_STRING`，其中还用`_SECURECRT_FILL_BUFFER_THRESHOLD`长度判断，还是跟着DEBUG走的，用memset将后面剩下的char赋值为254。后面在`_FILL_STRING`章节详细论述一下这个

```c++
// from internal_securecrt.h
#define _VALIDATE_POINTER_ERROR_RETURN(_Pointer, _ErrorCode, _Ret) \
    _VALIDATE_RETURN((_Pointer) != NULL, (_ErrorCode), (_Ret))
```

#### 小结（-VALIDATE-POINTER-RESET-STRING）

上个宏检查DEST，这个宏检查`_SRC != NULL`，不满足则将DEST首个字符的值赋0，DEBUG模式下会有一套更安全但是更耗性能的DEST重置方式，放在后面`_FILL_STRING`的时候一起写

```c++
// Same like _VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);
if (_SRC == NULL) {
    *_DEST = 0;
#ifdef _DEBUG
    _FILL_STRING(_DEST, _SIZE, 1);
#endif
    errno = EINVAL;
    return EINVAL;
}
```

### `_RESET_STRING`

```c++
_RESET_STRING(_DEST, _SIZE);

// from internal_securecrt.h
#define _RESET_STRING(_String, _Size) \
    *(_String) = 0; \
    _FILL_STRING((_String), (_Size), 1);
```

上面已经套娃过这个宏了，不再赘述

#### 小结（-RESET-STRING）

同样_DEBUG的时候，更安全的重置方式，放在后面`_FILL_STRING`的时候一起写

```c++
// Same like _RESET_STRING(_DEST, _SIZE);
*_DEST = 0;
#ifdef _DEBUG
    _FILL_STRING(_DEST, _SIZE, 1);
#endif
```

### `_RETURN_BUFFER_TOO_SMALL`

```c++
_RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);

// from internal_securecrt.h
#define _RETURN_BUFFER_TOO_SMALL(_String, _Size) \
    _RETURN_BUFFER_TOO_SMALL_ERROR((_String), (_Size), ERANGE)

// from internal_securecrt.h
#define _RETURN_BUFFER_TOO_SMALL_ERROR(_String, _Size, _Ret) \
    _VALIDATE_RETURN((L"Buffer is too small" && 0), ERANGE, _Ret)

// from errno.h
#define ERANGE          34
```

#### 小结（-RETURN-BUFFER-TOO-SMALL）

```c++
// Same like _RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);
errno = ERANGE;
return ERANGE;
```

### `_FILL_STRING`

终于讲到前面反复提及的_FILL_STRING了，其实也并没有很复杂，先看下定义

```c++
// from internal_securecrt.h
/* string resetting */
#define _FILL_STRING _SECURECRT__FILL_STRING

// from internal.h
#if _SECURECRT_FILL_BUFFER
#define _SECURECRT__FILL_STRING(_String, _Size, _Offset)                            \
    if ((_Size) != ((size_t)-1) && (_Size) != INT_MAX &&                            \
        ((size_t)(_Offset)) < (_Size))                                              \
    {                                                                               \
        memset((_String) + (_Offset),                                               \
            _SECURECRT_FILL_BUFFER_PATTERN,                                         \
            (_SECURECRT_FILL_BUFFER_THRESHOLD < ((size_t)((_Size) - (_Offset))) ?   \
                _SECURECRT_FILL_BUFFER_THRESHOLD :                                  \
                ((_Size) - (_Offset))) * sizeof(*(_String)));                       \
    }
#else  /* _SECURECRT_FILL_BUFFER */
#define _SECURECRT__FILL_STRING(_String, _Size, _Offset)
#endif  /* _SECURECRT_FILL_BUFFER */

// from internal.h
#ifdef _DEBUG
#define _SECURECRT_FILL_BUFFER 1
#else  /* _DEBUG */
#define _SECURECRT_FILL_BUFFER 0
#endif  /* _DEBUG */

// from corecrt.h, 0xFE = 254
#define _SECURECRT_FILL_BUFFER_PATTERN 0xFE

// from internal.h
#ifdef _DEBUG
#define _SECURECRT_FILL_BUFFER_THRESHOLD __crtDebugFillThreshold
#else  /* _DEBUG */
#define _SECURECRT_FILL_BUFFER_THRESHOLD ((size_t)0)
#endif  /* _DEBUG */

// from dbgheap.c
extern "C" size_t __crtDebugFillThreshold = SIZE_MAX;
```

`_FILL_STRING`整个宏，仅在_DEBUG定义时work，否则什么也不做；

`_SECURECRT__FILL_STRING(_String, _Size, _Offset)`
三个参数很好理解，目的字符串、目的字符串长度、填充的起始偏移量

`if ((_Size) != ((size_t)-1) && (_Size) != INT_MAX && ((size_t)(_Offset)) < (_Size))`
就是检查_Size合法性，并且要求_Offset小于_Size

然后`memset`从`(_String) + (_Offset)`地址开始，填充`0xFE`。非DEBUG模式下填充0个字节，还是相当于什么也不做，多一重判断；DEBUG模式下填充`(_Size - _Offset) * sizeof(char)`。

#### 小结（-FILL-STRING）

```c++
// Same like _FILL_STRING(_DEST, _SIZE, _OFFSET);
#ifdef _DEBUG
    if (_OFFSET < _Size)
    {
        memset(_DEST + _OFFSET, 0xFE, (_Size - _Offset) * sizeof(char));
    }
#else
// Do nothing;
#endif
```

### `_RETURN_NO_ERROR`

```c++
// from internal_securecrt.h
/* returns without calling _invalid_parameter */
#define _RETURN_NO_ERROR \
    return 0
```

终于有一个不套娃的了XD

#### 小结（-RETURN-NO-ERROR）

```c++
// Same like _RETURN_NO_ERROR;
return 0;
```

## 分析结论

再粘一遍源码，方便对照着看

```c++
_FUNC_PROLOGUE
errno_t __cdecl _FUNC_NAME(_CHAR *_DEST, size_t _SIZE, const _CHAR *_SRC)
{
    _CHAR *p;
    size_t available;

    /* validation section */
    _VALIDATE_STRING(_DEST, _SIZE);
    _VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);

    p = _DEST;
    available = _SIZE;
    while ((*p++ = *_SRC++) != 0 && --available > 0)
    {
    }

    if (available == 0)
    {
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);
    }
    _FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);
    _RETURN_NO_ERROR;
}
```

1. `_VALIDATE_STRING(_DEST, _SIZE);` 检验`_DEST != NULL && _Size > 0`是否满足；若为假，则`errno = EINVAL`，并直接`return EINVAL`；如果是在Debug模式下（`_DEBUG`宏被定义过）还会弹出提示窗口、触发调试断点、记录下错误发生位置等
2. `_VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);` 判断`_SRC == NULL`是否满足；若为真，则Reset `_DEST`，`errno = EINVAL`，并直接`return EINVAL`，Debug模式下也同样弹窗、断点、错误等
3. 算法逻辑：与分析中的没有区别，逐字符拷贝，如果正常拷到`'\0'`，或者`available`跑完了，就停止
4. 如果`available == 0`，说明`_SRC`的长度超过了`_SIZE`，即超过了目的字符串最大可用长度，拷贝失败。
5. `_RESET_STRING(_DEST, _SIZE);` 重置字符串，`*_DEST = 0;`，且`_FILL_STRING(_DEST, _SIZE, 1);`。即将首个字符赋值为`'\0'`，后面的字符填充安全字符`0xFE`。需要说明的是，`_FILL_STRING`也仅在Debug模式下才进行，否则什么也不处理
6. `_RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);` `errno = ERANGE`，并直接`return ERANGE`，Debug模式下也同样弹窗、断点、错误等
7. `_FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);`就是调用`memset`，将`_DEST`比`_SRC`多出来的部分（`[_SIZE - available + 1, _Size)`）全部填充为安全字符`0xFE`。同样，`_FILL_STRING`也仅在Debug模式下才进行，否则什么也不处理

可能有点绕，接着看下一章节简化实现应该就清晰了~

## 简化实现

看完了源码，我们来写个简单点的strcpy_s吧

```c++
void fill_string(char * string, size_t size, size_t offset);

errno_t strcpy_s(char *_DEST, size_t _SIZE, const char *_SRC)
{
    char *p;
    size_t available;

    if (!(_DEST != NULL && _Size > 0))
    {
        errno = EINVAL;
        return EINVAL;
    }
    if (_SRC == NULL) {
        *_DEST = 0;
        fill_string(_DEST, _SIZE, 1);
        errno = EINVAL;
        return EINVAL;
    }

    p = _DEST;
    available = _SIZE;
    while ((*p++ = *_SRC++) != 0 && --available > 0)
    {
    }

    if (available == 0)
    {
        *_DEST = 0;
        fill_string(_DEST, _SIZE, 1);
        errno = ERANGE;
        return ERANGE;
    }
    fill_string(_DEST, _SIZE, _SIZE - available + 1);
    return 0;
}

inline void fill_string(char * string, size_t size, size_t offset)
{
#ifdef _DEBUG
    if (offset < size)
    {
        memset(string + offset, 0xFE, (size - offset) * sizeof(char));
    }
#else
    // do nothing
    ;
#endif
}
```

## 扩展延伸

既然讲完了`strcpy_s`，那其他的字符串操作函数的`_safe`版本呢？下面再看下`strcat_s`和`strset_s`。也不多啰嗦了，直接粘出没见过的宏的实现，然后我们在写个简化实现看下~

### `strcat_s`

```c++
/***
*tcscat_s.inl - general implementation of _tcscpy_s
*
*       Copyright (c) Microsoft Corporation. All rights reserved.
*
*Purpose:
*       This file contains the general algorithm for strcat_s and its variants.
*
****/

_FUNC_PROLOGUE
errno_t __cdecl _FUNC_NAME(_CHAR *_DEST, size_t _SIZE, const _CHAR *_SRC)
{
    _CHAR *p;
    size_t available;

    /* validation section */
    _VALIDATE_STRING(_DEST, _SIZE);
    _VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);

    p = _DEST;
    available = _SIZE;
    while (available > 0 && *p != 0)
    {
        p++;
        available--;
    }

    if (available == 0)
    {
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_DEST_NOT_NULL_TERMINATED(_DEST, _SIZE);
    }

    while ((*p++ = *_SRC++) != 0 && --available > 0)
    {
    }

    if (available == 0)
    {
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);
    }
    _FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);
    _RETURN_NO_ERROR;
}
```

没见过的宏：

```c++
// from internal_securecrt.h
#define _RETURN_DEST_NOT_NULL_TERMINATED(_String, _Size) \
    _VALIDATE_RETURN((L"String is not null terminated" && 0), EINVAL, EINVAL)

```

简化实现：

```c++
void fill_string(char * string, size_t size, size_t offset);

errno_t strcat_s(char *_DEST, size_t _SIZE, const char *_SRC)
{
    char *p;
    size_t available;

    if (!(_DEST != NULL && _Size > 0))
    {
        errno = EINVAL;
        return EINVAL;
    }
    if (_SRC == NULL) {
        *_DEST = 0;
        fill_string(_DEST, _SIZE, 1);
        errno = EINVAL;
        return EINVAL;
    }

    p = _DEST;
    available = _SIZE;
    while (available > 0 && *p != 0)
    {
        p++;
        available--;
    }

    if (available == 0)
    {
        *_DEST = 0;
        fill_string(_DEST, _SIZE, 1);
        errno = EINVAL;
        return EINVAL;
    }

    while ((*p++ = *_SRC++) != 0 && --available > 0)
    {
    }

    if (available == 0)
    {
        *_DEST = 0;
        fill_string(_DEST, _SIZE, 1);
        errno = ERANGE;
        return ERANGE;
    }
    fill_string(_DEST, _SIZE, _SIZE - available + 1);
    return 0;
}

inline void fill_string(char * string, size_t size, size_t offset)
{
#ifdef _DEBUG
    if (offset < size)
    {
        memset(string + offset, 0xFE, (size - offset) * sizeof(char));
    }
#else
    // do nothing
    ;
#endif
```

### `strset_s`

```c++
/***
*tcsset_s.inl - general implementation of _tcsset_s
*
*       Copyright (c) Microsoft Corporation. All rights reserved.
*
*Purpose:
*       This file contains the general algorithm for _strset_s and its variants.
*
****/

_FUNC_PROLOGUE
errno_t __cdecl _FUNC_NAME(_CHAR *_DEST, size_t _SIZE, _CHAR_INT _Value)
{
    _CHAR *p;
    size_t available;

    /* validation section */
    _VALIDATE_STRING(_DEST, _SIZE);

    p = _DEST;
    available = _SIZE;
    while (*p != 0 && --available > 0)
    {
        *p++ = (_CHAR)_Value;
    }

    if (available == 0)
    {
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_DEST_NOT_NULL_TERMINATED(_DEST, _SIZE);
    }
    _FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);
    _RETURN_NO_ERROR;
}
```

简化实现：

```c++
void fill_string(char * string, size_t size, size_t offset);

errno_t strset_s(char *_DEST, size_t _SIZE, int _Value)
{
    char *p;
    size_t available;

    if (!(_DEST != NULL && _Size > 0))
    {
        errno = EINVAL;
        return EINVAL;
    }

    p = _DEST;
    available = _SIZE;
    while (*p != 0 && --available > 0)
    {
        *p++ = (char)_Value;
    }

    if (available == 0)
    {
        *_DEST = 0;
        fill_string(_DEST, _SIZE, 1);
        errno = EINVAL;
        return EINVAL;
    }
    fill_string(_DEST, _SIZE, _SIZE - available + 1);
    return 0;
}

inline void fill_string(char * string, size_t size, size_t offset)
{
#ifdef _DEBUG
    if (offset < size)
    {
        memset(string + offset, 0xFE, (size - offset) * sizeof(char));
    }
#else
    // do nothing
    ;
#endif
}
```

## 进一步扩展

聊完了普通版本的_Safe版本string函数，再进一步扩展下所有的string函数safe版本

肝力有限，先把微软的实现粘出来，有空再更新吧

### `strtok_s`

```c++
/***
*tcstok_s.inl - general implementation of _tcstok_s
*
*       Copyright (c) Microsoft Corporation. All rights reserved.
*
*Purpose:
*       This file contains the general algorithm for strtok_s and its variants.
*
****/

_FUNC_PROLOGUE
_CHAR * __cdecl _FUNC_NAME(_CHAR *_String, const _CHAR *_Control, _CHAR **_Context)
{
    _CHAR *token;
    const _CHAR *ctl;

    /* validation section */
    _VALIDATE_POINTER_ERROR_RETURN(_Context, EINVAL, NULL);
    _VALIDATE_POINTER_ERROR_RETURN(_Control, EINVAL, NULL);
    _VALIDATE_CONDITION_ERROR_RETURN(_String != NULL || *_Context != NULL, EINVAL, NULL);

    /* If string==NULL, continue with previous string */
    if (!_String)
    {
        _String = *_Context;
    }

    /* Find beginning of token (skip over leading delimiters). Note that
    * there is no token iff this loop sets string to point to the terminal null. */
    for ( ; *_String != 0 ; _String++)
    {
        for (ctl = _Control; *ctl != 0 && *ctl != *_String; ctl++)
            ;
        if (*ctl == 0)
        {
            break;
        }
    }

    token = _String;

    /* Find the end of the token. If it is not the end of the string,
    * put a null there. */
    for ( ; *_String != 0 ; _String++)
    {
        for (ctl = _Control; *ctl != 0 && *ctl != *_String; ctl++)
            ;
        if (*ctl != 0)
        {
            *_String++ = 0;
            break;
        }
    }

    /* Update the context */
    *_Context = _String;

    /* Determine if a token has been found. */
    if (token == _String)
    {
        return NULL;
    }
    else
    {
        return token;
    }
}
```

### `strncpy_s`

```c++
/***
*tcsncpy_s.inl - general implementation of _tcsncpy_s
*
*       Copyright (c) Microsoft Corporation. All rights reserved.
*
*Purpose:
*       This file contains the general algorithm for strncpy_s and its variants.
*
****/

_FUNC_PROLOGUE
errno_t __cdecl _FUNC_NAME(_CHAR *_DEST, size_t _SIZE, const _CHAR *_SRC, size_t _COUNT)
{
    _CHAR *p;
    size_t available;

    if (_COUNT == 0 && _DEST == NULL && _SIZE == 0)
    {
        /* this case is allowed; nothing to do */
        _RETURN_NO_ERROR;
    }

    /* validation section */
    _VALIDATE_STRING(_DEST, _SIZE);
    if (_COUNT == 0)
    {
        /* notice that the source string pointer can be NULL in this case */
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_NO_ERROR;
    }
    _VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);

    p = _DEST;
    available = _SIZE;
    if (_COUNT == _TRUNCATE)
    {
        while ((*p++ = *_SRC++) != 0 && --available > 0)
        {
        }
    }
    else
    {
        _ASSERT_EXPR((!_CrtGetCheckCount() || _COUNT < _SIZE), L"Buffer is too small");

        while ((*p++ = *_SRC++) != 0 && --available > 0 && --_COUNT > 0)
        {
        }
        if (_COUNT == 0)
        {
            *p = 0;
        }
    }

    if (available == 0)
    {
        if (_COUNT == _TRUNCATE)
        {
            _DEST[_SIZE - 1] = 0;
            _RETURN_TRUNCATE;
        }
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);
    }
    _FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);
    _RETURN_NO_ERROR;
}
```

### `strncat_s`

```c++
/***
*tcsncat_s.inl - general implementation of _tcscpy_s
*
*       Copyright (c) Microsoft Corporation. All rights reserved.
*
*Purpose:
*       This file contains the general algorithm for strncat_s and its variants.
*
****/

_FUNC_PROLOGUE
errno_t __cdecl _FUNC_NAME(_CHAR *_DEST, size_t _SIZE, const _CHAR *_SRC, size_t _COUNT)
{
    _CHAR *p;
    size_t available;

    if (_COUNT == 0 && _DEST == NULL && _SIZE == 0)
    {
        /* this case is allowed; nothing to do */
        _RETURN_NO_ERROR;
    }

    /* validation section */
    _VALIDATE_STRING(_DEST, _SIZE);
    if (_COUNT != 0)
    {
        _VALIDATE_POINTER_RESET_STRING(_SRC, _DEST, _SIZE);
    }

    p = _DEST;
    available = _SIZE;
    while (available > 0 && *p != 0)
    {
        p++;
        available--;
    }

    if (available == 0)
    {
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_DEST_NOT_NULL_TERMINATED(_DEST, _SIZE);
    }

    if (_COUNT == _TRUNCATE)
    {
        while ((*p++ = *_SRC++) != 0 && --available > 0)
        {
        }
    }
    else
    {
        _ASSERT_EXPR((!_CrtGetCheckCount() || _COUNT < available), L"Buffer is too small");

        while (_COUNT > 0 && (*p++ = *_SRC++) != 0 && --available > 0)
        {
            _COUNT--;
        }
        if (_COUNT == 0)
        {
            *p = 0;
        }
    }

    if (available == 0)
    {
        if (_COUNT == _TRUNCATE)
        {
            _DEST[_SIZE - 1] = 0;
            _RETURN_TRUNCATE;
        }
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_BUFFER_TOO_SMALL(_DEST, _SIZE);
    }
    _FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);
    _RETURN_NO_ERROR;
}
```

### `strnset_s`

```c++
/***
*tcsnset_s.inl - general implementation of _tcsnset_s
*
*       Copyright (c) Microsoft Corporation. All rights reserved.
*
*Purpose:
*       This file contains the general algorithm for _strnset_s and its variants.
*
****/

_FUNC_PROLOGUE
errno_t __cdecl _FUNC_NAME(_CHAR *_DEST, size_t _SIZE, _CHAR_INT _Value, size_t _COUNT)
{
    _CHAR *p;
    size_t available;

    /* validation section */
    if (_COUNT == 0 && _DEST == NULL && _SIZE == 0)
    {
        /* this case is allowed; nothing to do */
        _RETURN_NO_ERROR;
    }
    _VALIDATE_STRING(_DEST, _SIZE);

    _ASSERT_EXPR((!_CrtGetCheckCount() || _COUNT < _SIZE), L"Buffer is too small");

    p = _DEST;
    available = _SIZE;
    while (*p != 0 && _COUNT > 0 && --available > 0)
    {
        *p++ = (_CHAR)_Value;
        --_COUNT;
    }

    if (_COUNT == 0)
    {
        /* ensure the string is null-terminated */
        while (*p != 0 && --available > 0)
        {
            ++p;
        }
    }

    if (available == 0)
    {
        _RESET_STRING(_DEST, _SIZE);
        _RETURN_DEST_NOT_NULL_TERMINATED(_DEST, _SIZE);
    }
    _FILL_STRING(_DEST, _SIZE, _SIZE - available + 1);
    _RETURN_NO_ERROR;
}
```

## 参考资料

- [C++string函数之strcpy_s](https://www.cnblogs.com/djzny/p/4476221.html) 注：该文章中对几个宏的解释存在错误，请甄别阅读
- [strcpy_s的函数实现是啥？](https://bbs.csdn.net/topics/390641877)
