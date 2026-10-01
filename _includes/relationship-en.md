<!-- Generated from story_map_contracts.json; edit its locale labels, not topology here. -->
<div class="kt-story-map" data-map-id="relationship" style="--kt-map-inline-height:380px;--kt-map-mobile-height:300px">
<p class="kt-map-title"><strong>Formal relationships: Macsen and Zhokhar</strong></p>
<p class="kt-map-rule">The current version allows one confirmed partner route. Confirming Macsen closes Zhokhar’s formal relationship progression and Ray’s nest invitation.</p>
<p class="kt-map-hint" id="relationship-hint">Select a node for the guide. Drag to pan; Ctrl / pinch to zoom. The full map supports wheel and trackpad, arrow keys, + / −, 0 / F to reset the view, and Esc to close.</p>
<div class="kt-story-map-scroll" role="region" aria-label="Formal relationships: Macsen and Zhokhar" aria-describedby="relationship-hint" tabindex="0">

```mermaid
%%{init: {"flowchart": {"curve": "linear", "nodeSpacing": 16, "rankSpacing": 22, "padding": 8}, "themeVariables": {"fontSize": "15px"}}}%%
flowchart LR
    accTitle: Formal relationships: Macsen and Zhokhar
    accDescr: Without confirmed Macsen, Zhokhar remains possible, subject to his own conditions. Keep a normal save before the Day 11 balcony decision to compare branches.
    subgraph macsenLane["Macsen"]
        direction TB
        intention["Day 8 Romantic<br/>Optional intention"]
        friendly["Day 8 Friendly"]
        massage["Day 10 massage<br/>Local event"]
        balcony["Day 11 balcony<br/>Formal decision"]
        macYes["Macsen confirmed"]
        macNo["Macsen not confirmed<br/>Earlier intention cleared"]
        intention -.->|Opens local content| massage
        intention -.->|Can reconsider; not required| balcony
        friendly --> balcony
        balcony ==>|Yes| macYes
        balcony -->|No| macNo
    end
    subgraph zhokharLane["Zhokhar"]
        direction TB
        zTalk["Spiceport Day 3 private talk"]
        trial["Competition<br/>Reconsiderable trial"]
        support["Support<br/>No trial"]
        zPark["Day 6 park invitation<br/>Local event"]
        zFormal["Spiceport Day 7<br/>Formal question<br/><span class='kt-map-annotation'>Competition is not required;<br/>sufficient closeness can also qualify</span>"]
        zYes["Zhokhar confirmed"]
        zNo["Zhokhar not confirmed<br/>Existing trial ends"]
        zTalk --> trial
        zTalk --> support
        trial -->|Trial opens invitation| zPark
        trial --> zFormal
        support --> zFormal
        zFormal ==>|Yes| zYes
        zFormal -->|No| zNo
    end
    macsenLane ~~~ zhokharLane
    class massage,zPark ktMapLocal
    class macYes,zYes ktMapConfirmed
    class balcony,zFormal ktMapDecision
    click intention href "#macsen-early" "Day 8 Romantic Optional intention" _self
    click massage href "#macsen-day10-massage" "Day 10 massage Local event" _self
    click friendly href "#macsen-early" "Day 8 Friendly" _self
    click balcony href "#macsen-balcony" "Day 11 balcony Formal decision" _self
    click macYes href "#macsen-balcony" "Macsen confirmed" _self
    click macNo href "#macsen-balcony" "Macsen not confirmed Earlier intention cleared" _self
    click zTalk href "#zhokhar-spiceport" "Spiceport Day 3 private talk" _self
    click trial href "#zhokhar-spiceport" "Competition Reconsiderable trial" _self
    click support href "#zhokhar-spiceport" "Support No trial" _self
    click zPark href "#zhokhar-spiceport" "Day 6 park invitation Local event" _self
    click zFormal href "#zhokhar-spiceport" "Spiceport Day 7 Formal question" _self
    click zYes href "#zhokhar-spiceport" "Zhokhar confirmed" _self
    click zNo href "#zhokhar-spiceport" "Zhokhar not confirmed Existing trial ends" _self
```

</div>

<p class="kt-map-preparation"><a href="#prepare-zhokhar">Zhokhar</a> — Warehouse is one way to prepare the relationship, not a requirement.</p>
<p class="kt-map-note">Without confirmed Macsen, Zhokhar remains possible, subject to his own conditions. Keep a normal save before the Day 11 balcony decision to compare branches.</p>
<div class="kt-map-local-invitations"><p class="kt-map-local-title"><strong>Local invitations</strong></p><div class="kt-map-local-grid"><div class="kt-map-local-card" data-local-invitation="ray"><p><strong>Ray</strong> — A local nest invitation that night in ???; requires the relevant preparation and no confirmed Macsen. Accepting does not confirm a partner.</p><p><a href="#prepare-ray">Preparation</a> · <a href="#question-mark-ray">That night’s invitation</a></p></div><div class="kt-map-local-card" data-local-invitation="cabotte"><p><strong>Cabotte</strong> — A local invitation after the Wilds Day 8 conditions are met. Sure enters that night’s event without confirming a partner.</p><p><a href="#cabotte-wilds">Invitation conditions</a></p></div></div></div>
<details class="kt-map-text-links"><summary>Text links</summary><p><a href="#macsen-early">Day 8 Romantic · Optional intention</a> · <a href="#macsen-day10-massage">Day 10 massage · Local event</a> · <a href="#macsen-early">Day 8 Friendly</a> · <a href="#macsen-balcony">Day 11 balcony · Formal decision</a> · <a href="#macsen-balcony">Macsen confirmed</a> · <a href="#macsen-balcony">Macsen not confirmed · Earlier intention cleared</a> · <a href="#zhokhar-spiceport">Spiceport Day 3 private talk</a> · <a href="#zhokhar-spiceport">Competition · Reconsiderable trial</a> · <a href="#zhokhar-spiceport">Support · No trial</a> · <a href="#zhokhar-spiceport">Day 6 park invitation · Local event</a> · <a href="#zhokhar-spiceport">Spiceport Day 7 · Formal question</a> · <a href="#zhokhar-spiceport">Zhokhar confirmed</a> · <a href="#zhokhar-spiceport">Zhokhar not confirmed · Existing trial ends</a></p></details>
</div>
