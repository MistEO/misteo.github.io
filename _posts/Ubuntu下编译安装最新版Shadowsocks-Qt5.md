---
title: Ubuntu下源码编译安装最新版Shadowsocks-Qt5
date: 2018-03-08 11:17:35
reward: true
tags:
    - 教程
    - Linux
thumbnail: /post_images/ss.png
---

既然说好的打造技术博客，总得写点干货什么的，正好前些日子买个了新的ss服务，买完才注意到加密方式是`chacha20-ietf-poly1305`，再一看Shadowsocks-Qt5在Ubuntu的软件源里面最新版本只是2.9，不支持啊，于是只能自己研究一下怎么弄了，遇到了不少坑，和大家分享一下经验方法。

<!-- more -->

## 卸载旧版本`Shadowsocks-Qt5`

```bash
sudo apt-get purge shadowsocks-qt5
```

## 安装`libsodium`

```bash
sudo apt-get install libsodium-dev
```

## 安装`libbotan-2.x`

下载解压编译安装，没啥好说的，可以访问[Botan-Index of release](https://botan.randombit.net/releases/) 获取最新本版，虽说新版本好像也没啥用XD

```bash
wget https://botan.randombit.net/releases/Botan-2.3.0.tgz
tar xvf Botan-2.3.0.tgz
cd Botan-2.3.0
./configure.py
make
sudo make install
sudo ldconfig
```

## 安装`libQtShadowsocks`

```bash
sudo apt-get install qt5-qmake qtbase5-dev libqrencode-dev libqtshadowsocks-dev libappindicator-dev libzbar-dev libbotan1.10-dev
git clone https://github.com/shadowsocks/libQtShadowsocks.git
mkdir build
cd build
cmake ..
make
sudo make install
sudo ldconfig
```

如果软件源中没有libqtshadowsocks-dev，可以使用pip安装

```bash
sudo apt-get install python-pip
sudo pip install shadowsocks
```

如果原先安装过Qt，可能会提示找不到Qt目录，导入环境变量，然后重新编译安装

```bash
export LD_LIBRARY_PATH=/opt/Qt5.10.0/5.10.0/gcc_64/lib/
rm -rf *    #删除build文件夹中文件
cmake ..
make
sudo make install
sudo ldconfig
```

## 安装`Shadowsocks-Qt5`

```bash
sudo apt-get install qt5-qmake qtbase5-dev libqrencode-dev libqtshadowsocks-dev libappindicator-dev libzbar-dev libbotan1.10-dev
git clone https://github.com/shadowsocks/shadowsocks-qt5.git
cd shadowsocks-qt5
mkdir build
cd build
cmake ..
make
sudo make install
sudo ldconfig
```

如果提示找不到Qt目录，编辑`CMakeLists.txt`，加入一行并保存

```cmake
set(CMAKE_PREFIX_PATH "/opt/Qt5.10.0/5.10.0/gcc_64")
```

然后重新编译安装

```bash
rm -rf *    #删除build文件夹中文件
cmake ..
make
sudo make install
sudo ldconfig
```

## 启动`ss-qt5`

直接启动即可

```bash
ss-qt5
```

若提示

```bash
ss-qt5: /usr/lib/x86_64-linux-gnu/libQt5DBus.so.5: version `Qt_5' not found (required by ss-qt5)
ss-qt5: /usr/lib/x86_64-linux-gnu/libQt5Network.so.5: version `Qt_5' not found (required by ss-qt5)
ss-qt5: /usr/lib/x86_64-linux-gnu/libQt5Gui.so.5: version `Qt_5' not found (required by ss-qt5)
ss-qt5: /usr/lib/x86_64-linux-gnu/libQt5Core.so.5: version `Qt_5.10' not found (required by ss-qt5)
ss-qt5: /usr/lib/x86_64-linux-gnu/libQt5Core.so.5: version `Qt_5' not found (required by ss-qt5)
ss-qt5: /usr/lib/x86_64-linux-gnu/libQt5Widgets.so.5: version `Qt_5' not found (required by ss-qt5)
```

则还是环境变量的问题，导入后重新启动即可

```bash
export LD_LIBRARY_PATH=/opt/Qt5.10.0/5.10.0/gcc_64/lib
ss-qt5
```

启动后在`帮助`-`关于`查看一下版本号若是新版就ok了
![ss-qt5](/post_images/ss-qt5.png)

这时手动添加一个新连接，就已经可以看到加密方式中有`chacha20-ietf-poly1305`选项了
![配置新连接](/post_images/ss-connect.png)

## Tips

可以写个sh，放到桌面双击启动

```bash
#/bin/bash
export LD_LIBRARY_PATH=/opt/Qt5.10.0/5.10.0/gcc_64/lib
ss-qt5
```

将`文件管理器`-`编辑`-`首选项`-`行为`-`可执行文本文件`修改为`打开可执行文本文件时运行它们`即可，别忘了给sh脚本执行权限哦
![文件行为设置](/post_images/file-settings.png)

顺便说一下命令行中如何使用ss，以及`method chacha20-ietf-poly1305 not supported`咋解决

新建json文件，内容格式如下

```json
{
    "server": "1.2.3.4",
    "server_port": "1234",
    "password": "1234567",
    "local_address": "127.0.0.1",
    "local_port": 1080,
    "timeout":300,
    "method":"chacha20-ietf-poly1305",
    "fast_open": false,
    "workers": 1
}
```

然后安装最新版本ss并从文件中配置启动即可

```bash
sudo pip install https://github.com/shadowsocks/shadowsocks/archive/master.zip -U
sslocal -c xxx.json
```

想让命令走ss推荐使用`porxychains`，具体使用方法可以Google一下不再赘述

## 参考资料

- [Add support for chacha20-ietf-poly1305 #595](https://github.com/shadowsocks/shadowsocks-qt5/issues/595#issue)
- [Kali Linux 下安装 Shadowsocks-qt5 及使用教程](http://www.lujza.me/kali-linux-%E4%B8%8B%E5%AE%89%E8%A3%85-shadowsocks-qt5-%E5%8F%8A%E4%BD%BF%E7%94%A8%E6%95%99%E7%A8%8B.html)
