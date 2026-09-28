---
title: HC5761刷OpenWrt并配置多播小结
date: 2018-04-04 10:55:17
tags:
    - 路由器
    - 教程
---

这几天把公司宿舍的网络好好的折腾了一下，从平均10Mbps最高20Mbps勉强提升到了稳定30Mbps，总结一下心得

<!-- more -->

## 获取Root

云插件中安装`开发中模式`，好像还要关联微信什么的，GUI操作应该不困难，感觉没啥好说的，~~其实是因为好久以前弄的具体的我不记得了~~

## 刷机

注意以下命令行都是基于极贰（`HC5761`)，其他路由器同理，但需要改一下链接下载符合自己机型的文件不要直接复制

### 连上极路由

```bash
ssh -p 1022 root@192.168.1.1
```

密码就是路由器的管理密码

### 刷入Bootloader

这里我们刷入`Breed`，一个很强大的Bootloader，想刷入其他的可以下载[相关链接](#相关链接)中的其他文件

```bash
cd /tmp
wget https://breed.hackpascal.net/breed-mt7620-hiwifi-hc5761.bin
mtd write breed-mt7620-hiwifi-hc5761.bin u-boot
```

### 刷入固件

这里我们刷入`OpenWrt`，想刷入其他的可以下载[相关链接](#相关链接)中的其他文件

```bash
wget http://rssn.cn/roms/openwrt-ramips-mt7620a-hc5761-squashfs-sysupgrade.bin
sysupgrade -F -n openwrt-ramips-mt7620a-hc5761-squashfs-sysupgrade.bin
```

好像是只有`sysupgrade.bin`的固件可以使用这个命令行刷入，其他的固件可以进入`Bootloader`刷，具体的步骤为

1. 断电关机
2. 长按reset不放，同时通电，约5秒后松手
3. 进入<http://192.168.1.1>
4. 选择`固件更新`-`固件`-上传固件并更新

等待完成后重启，固件就刷好了

### 多播设置

待续。。。

## 相关链接

### Bootloader

- [breed](https://breed.hackpascal.net/)
- [u-boot](http://rssn.cn/roms/uboot/)

### Rom

- [OpenWrt](http://rssn.cn/roms/)
- [Padavan](http://opt.cn2qq.com/padavan/)
- [PandoraBox](http://downloads.openwrt.org.cn/PandoraBox/)

## 参考资料

- [极路由1、1s等机型刷OpenWrt--成为真正的极客- 简书](https://www.jianshu.com/p/196a43b79c24)
- [AR/QCA/MTK Breed，功能强大的多线程 Bootloader ,恩山无线论坛](http://www.right.com.cn/forum/thread-161906-1-1.html)
- [改华硕[N14U N54U]5G 2G的7620老毛子Padavan固件(私人云储存 aria2 QOS) ,恩山无线论坛](http://www.right.com.cn/forum/thread-161324-1-1.html)
- [OpenWrt路由器macvlan单线多拨的方法 - CSDN博客](https://blog.csdn.net/lvshaorong/article/details/70568791)
- [OpwnWrt 路由器MWAN3多线多拨实现方法 - CSDN博客](https://blog.csdn.net/lvshaorong/article/details/61916525)