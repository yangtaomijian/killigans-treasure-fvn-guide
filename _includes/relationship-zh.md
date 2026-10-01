<!-- Generated from story_map_contracts.json; edit its locale labels, not topology here. -->
<div class="kt-story-map" data-map-id="relationship" style="--kt-map-inline-height:380px;--kt-map-mobile-height:300px">
<p class="kt-map-title"><strong>正式关系：Macsen 与 Zhokhar</strong></p>
<p class="kt-map-rule">当前版本只可正式确认一条伴侣路线；确认 Macsen 后，Zhokhar 的正式关系进展与 Ray 的同巢邀请不再开放。</p>
<p class="kt-map-hint" id="relationship-hint">点击节点查正文；拖动平移，Ctrl／捏合缩放。完整图支持滚轮与触控板；方向键平移，＋／－缩放，0／F 重置视图，Esc 关闭。</p>
<div class="kt-story-map-scroll" role="region" aria-label="正式关系：Macsen 与 Zhokhar" aria-describedby="relationship-hint" tabindex="0">

```mermaid
%%{init: {"flowchart": {"curve": "linear", "nodeSpacing": 16, "rankSpacing": 22, "padding": 8}, "themeVariables": {"fontSize": "15px"}}}%%
flowchart LR
    accTitle: 正式关系：Macsen 与 Zhokhar
    accDescr: Macsen 未正式确认时，Zhokhar 的可能性仍开放，但仍须满足 Zhokhar 自身条件。比较分支前，在 Day 11 阳台决定前留普通存档。
    subgraph macsenLane["Macsen"]
        direction TB
        intention["Day 8 Romantic<br/>可选交往意向"]
        friendly["Day 8 Friendly"]
        massage["Day 10 按摩<br/>局部事件"]
        balcony["Day 11 阳台<br/>正式决定"]
        macYes["Macsen 正式确认"]
        macNo["不确认 Macsen<br/>清除此前交往意向"]
        intention -.->|开启局部内容| massage
        intention -.->|可重新考虑；非前置| balcony
        friendly --> balcony
        balcony ==>|Yes| macYes
        balcony -->|No| macNo
    end
    subgraph zhokharLane["Zhokhar"]
        direction TB
        zTalk["Spiceport Day 3 私谈"]
        trial["Competition<br/>可重新考虑的试探"]
        support["Support<br/>不建立试探"]
        zPark["Day 6 公园邀请<br/>局部事件"]
        zFormal["Spiceport Day 7<br/>正式关系提问<br/><span class='kt-map-annotation'>Competition 非必需；<br/>关系准备足够也可进入</span>"]
        zYes["Zhokhar 正式确认"]
        zNo["不确认 Zhokhar<br/>结束已有试探"]
        zTalk --> trial
        zTalk --> support
        trial -->|试探开启| zPark
        trial --> zFormal
        support --> zFormal
        zFormal ==>|Yes| zYes
        zFormal -->|No| zNo
    end
    macsenLane ~~~ zhokharLane
    class massage,zPark ktMapLocal
    class macYes,zYes ktMapConfirmed
    class balcony,zFormal ktMapDecision
    click intention href "#macsen-early" "Day 8 Romantic 可选交往意向" _self
    click massage href "#macsen-day10-massage" "Day 10 按摩 局部事件" _self
    click friendly href "#macsen-early" "Day 8 Friendly" _self
    click balcony href "#macsen-balcony" "Day 11 阳台 正式决定" _self
    click macYes href "#macsen-balcony" "Macsen 正式确认" _self
    click macNo href "#macsen-balcony" "不确认 Macsen 清除此前交往意向" _self
    click zTalk href "#zhokhar-spiceport" "Spiceport Day 3 私谈" _self
    click trial href "#zhokhar-spiceport" "Competition 可重新考虑的试探" _self
    click support href "#zhokhar-spiceport" "Support 不建立试探" _self
    click zPark href "#zhokhar-spiceport" "Day 6 公园邀请 局部事件" _self
    click zFormal href "#zhokhar-spiceport" "Spiceport Day 7 正式关系提问" _self
    click zYes href "#zhokhar-spiceport" "Zhokhar 正式确认" _self
    click zNo href "#zhokhar-spiceport" "不确认 Zhokhar 结束已有试探" _self
```

</div>

<p class="kt-map-preparation"><a href="#prepare-zhokhar">Zhokhar</a> — Warehouse 是其中一种关系准备方式，并非必需。</p>
<p class="kt-map-note">Macsen 未正式确认时，Zhokhar 的可能性仍开放，但仍须满足 Zhokhar 自身条件。比较分支前，在 Day 11 阳台决定前留普通存档。</p>
<div class="kt-map-local-invitations"><p class="kt-map-local-title"><strong>其他局部邀请</strong></p><div class="kt-map-local-grid"><div class="kt-map-local-card" data-local-invitation="ray"><p><strong>Ray</strong> — ??? 当晚的局部同巢邀请；需要对应准备且无 confirmed Macsen；接受不会确认伴侣。</p><p><a href="#prepare-ray">准备</a> · <a href="#question-mark-ray">当晚邀请</a></p></div><div class="kt-map-local-card" data-local-invitation="cabotte"><p><strong>Cabotte</strong> — Wilds Day 8 条件满足后的局部邀请；Sure 进入当晚事件，不会确认伴侣。</p><p><a href="#cabotte-wilds">邀请条件</a></p></div></div></div>
<details class="kt-map-text-links"><summary>文字链接</summary><p><a href="#macsen-early">Day 8 Romantic · 可选交往意向</a> · <a href="#macsen-day10-massage">Day 10 按摩 · 局部事件</a> · <a href="#macsen-early">Day 8 Friendly</a> · <a href="#macsen-balcony">Day 11 阳台 · 正式决定</a> · <a href="#macsen-balcony">Macsen 正式确认</a> · <a href="#macsen-balcony">不确认 Macsen · 清除此前交往意向</a> · <a href="#zhokhar-spiceport">Spiceport Day 3 私谈</a> · <a href="#zhokhar-spiceport">Competition · 可重新考虑的试探</a> · <a href="#zhokhar-spiceport">Support · 不建立试探</a> · <a href="#zhokhar-spiceport">Day 6 公园邀请 · 局部事件</a> · <a href="#zhokhar-spiceport">Spiceport Day 7 · 正式关系提问</a> · <a href="#zhokhar-spiceport">Zhokhar 正式确认</a> · <a href="#zhokhar-spiceport">不确认 Zhokhar · 结束已有试探</a></p></details>
</div>
