<!-- Generated from story_map_contracts.json; edit its locale labels, not topology here. -->
<div class="kt-story-map" data-map-id="spiceport-recovery" style="--kt-map-inline-height:440px;--kt-map-mobile-height:300px">
<p class="kt-map-title"><strong>Day 5–6：时间竞争与恢复分支</strong></p>
<p class="kt-map-hint" id="spiceport-recovery-hint">点击节点查正文；拖动平移，Ctrl／捏合缩放。完整图支持滚轮与触控板；方向键平移，＋／－缩放，0／F 重置视图，Esc 关闭。</p>
<div class="kt-story-map-scroll" role="region" aria-label="Day 5–6：时间竞争与恢复分支" aria-describedby="spiceport-recovery-hint" tabindex="0">

```mermaid
%%{init: {"flowchart": {"curve": "linear", "nodeSpacing": 22, "rankSpacing": 28, "padding": 10}, "themeVariables": {"fontSize": "15px"}}}%%
flowchart TD
    accTitle: Day 5–6：时间竞争与恢复分支
    accDescr: Day 5 clutchmates 成人邀约另须没有 Macsen 正式关系。Day 6 人物邀请并非自由地图中的一次活动：Sure 直接进入场景；Nah／无邀请才有两格探索。独自公园与托儿所入口另有条件，见正文。
    d5["Day 5：两格，先留普通存档"]
    fish5["Fishing Pier：两格"]
    clutch["clutchmates：两格，Day 5 限定"]
    invite["Day 6：Macsen 已确认／Zhokhar 已试探时邀请"]
    sure["Sure：直接进入人物公园场景"]
    noFree["无自由探索；不能补 Fishing"]
    decline["Nah／无邀请"]
    free["两格 free exploration"]
    recover["补 Fishing 或 General Store；其他入口看条件"]
    save6["邀请回答前分档：人物画面／补做活动"]
    d5 -->|本日安排 A| fish5
    d5 -->|本日安排 B；与钓鱼互斥| clutch
    clutch -.->|钓鱼留到 Day 6，须选择自由探索| recover
    invite -->|无邀请：跳过回答| decline
    invite -->|先存档再回答| save6
    save6 -->|接受邀请| sure
    sure --x|当天跳过探索地图| noFree
    save6 -->|Nah：拒绝邀请| decline
    decline -->|进入地图| free
    free -->|按两格预算和入口条件补做| recover
    click d5 href "#spiceport-day5" "Day 5：两格，先留普通存档" _self
    click fish5 href "#spiceport-day5" "Fishing Pier：两格" _self
    click clutch href "#spiceport-day5" "clutchmates：两格，Day 5 限定" _self
    click invite href "#spiceport-day6" "Day 6：Macsen 已确认／Zhokhar 已试探时邀请" _self
    click sure href "#spiceport-day6" "Sure：直接进入人物公园场景" _self
    click noFree href "#spiceport-day6" "无自由探索；不能补 Fishing" _self
    click decline href "#spiceport-day6" "Nah／无邀请" _self
    click free href "#spiceport-day6" "两格 free exploration" _self
    click recover href "#spiceport-day6" "补 Fishing 或 General Store；其他入口看条件" _self
    click save6 href "#spiceport-day6" "邀请回答前分档：人物画面／补做活动" _self
```

</div>

<p class="kt-map-note">Day 5 clutchmates 成人邀约另须没有 Macsen 正式关系。Day 6 人物邀请并非自由地图中的一次活动：Sure 直接进入场景；Nah／无邀请才有两格探索。独自公园与托儿所入口另有条件，见正文。</p>
<details class="kt-map-text-links"><summary>文字链接</summary><p><a href="#spiceport-day5">Day 5：两格，先留普通存档</a> · <a href="#spiceport-day5">Fishing Pier：两格</a> · <a href="#spiceport-day5">clutchmates：两格，Day 5 限定</a> · <a href="#spiceport-day6">Day 6：Macsen 已确认／Zhokhar 已试探时邀请</a> · <a href="#spiceport-day6">Sure：直接进入人物公园场景</a> · <a href="#spiceport-day6">无自由探索；不能补 Fishing</a> · <a href="#spiceport-day6">Nah／无邀请</a> · <a href="#spiceport-day6">两格 free exploration</a> · <a href="#spiceport-day6">补 Fishing 或 General Store；其他入口看条件</a> · <a href="#spiceport-day6">邀请回答前分档：人物画面／补做活动</a></p></details>
</div>
