<!-- Generated from story_map_contracts.json; edit its locale labels, not topology here. -->
<div class="kt-story-map" data-map-id="spiceport-planning" style="--kt-map-inline-height:440px;--kt-map-mobile-height:300px">
<p class="kt-map-title"><strong>Day 2–4：远足安排与早期用途</strong></p>
<p class="kt-map-hint" id="spiceport-planning-hint">点击节点查正文；拖动平移，Ctrl／捏合缩放。完整图支持滚轮与触控板；方向键平移，＋／－缩放，0／F 重置视图，Esc 关闭。</p>
<div class="kt-story-map-scroll" role="region" aria-label="Day 2–4：远足安排与早期用途" aria-describedby="spiceport-planning-hint" tabindex="0">

```mermaid
%%{init: {"flowchart": {"curve": "linear", "nodeSpacing": 16, "rankSpacing": 20, "padding": 7}, "themeVariables": {"fontSize": "15px"}}}%%
flowchart TD
    accTitle: Day 2–4：远足安排与早期用途
    accDescr: 活动还能完成，不等于依赖它的早期事件还能赶上。Warehouse Day 4 的远足与 Day 3 私谈必须分开判断；时间格的精确信息仍见下表。
    d2["Day 2：两格，选一处远足"]
    d3["Day 3：一格独行＋两格远足"]
    d4["Day 4：一格独行＋最后一处远足"]
    all["三处远足均可完成"]
    wEarly["Warehouse Day 2/3：可用于早期准备"]
    talk["Day 3 私谈：另看相处与关系条件"]
    wLate["Warehouse Day 4：远足本身仍可做"]
    miss["但已赶不上 Day 3 私谈的早期用途"]
    d2 -->|次日安排| d3
    d3 -->|次日安排| d4
    d4 -->|每次选尚未去过的一处| all
    wEarly -.->|可用加成；不是逐项必需| talk
    wLate -->|计入远足本身| all
    wLate --x|早期窗口已过去| miss
    click d2 href "#spiceport-early-excursions" "Day 2：两格，选一处远足" _self
    click d3 href "#spiceport-early-excursions" "Day 3：一格独行＋两格远足" _self
    click d4 href "#spiceport-early-excursions" "Day 4：一格独行＋最后一处远足" _self
    click all href "#spiceport-early-excursions" "三处远足均可完成" _self
    click wEarly href "#spiceport-early-excursions" "Warehouse Day 2/3：可用于早期准备" _self
    click talk href "../reference/relationships.html#prepare-zhokhar" "Day 3 私谈：另看相处与关系条件" _self
    click wLate href "#spiceport-early-excursions" "Warehouse Day 4：远足本身仍可做" _self
    click miss href "#spiceport-early-excursions" "但已赶不上 Day 3 私谈的早期用途" _self
```

</div>

<p class="kt-map-note">活动还能完成，不等于依赖它的早期事件还能赶上。Warehouse Day 4 的远足与 Day 3 私谈必须分开判断；时间格的精确信息仍见下表。</p>
<details class="kt-map-text-links"><summary>文字链接</summary><p><a href="#spiceport-early-excursions">Day 2：两格，选一处远足</a> · <a href="#spiceport-early-excursions">Day 3：一格独行＋两格远足</a> · <a href="#spiceport-early-excursions">Day 4：一格独行＋最后一处远足</a> · <a href="#spiceport-early-excursions">三处远足均可完成</a> · <a href="#spiceport-early-excursions">Warehouse Day 2/3：可用于早期准备</a> · <a href="../reference/relationships.html#prepare-zhokhar">Day 3 私谈：另看相处与关系条件</a> · <a href="#spiceport-early-excursions">Warehouse Day 4：远足本身仍可做</a> · <a href="#spiceport-early-excursions">但已赶不上 Day 3 私谈的早期用途</a></p></details>
</div>
