<!-- Generated from story_map_contracts.json; edit its locale labels, not topology here. -->
<div class="kt-story-map" data-map-id="spiceport-planning" style="--kt-map-inline-height:440px;--kt-map-mobile-height:300px">
<p class="kt-map-title"><strong>Days 2–4: excursions and early uses</strong></p>
<p class="kt-map-hint" id="spiceport-planning-hint">Select a node for the guide. Drag to pan; Ctrl / pinch to zoom. The full map supports wheel and trackpad, arrow keys, + / −, 0 / F to reset the view, and Esc to close.</p>
<div class="kt-story-map-scroll" role="region" aria-label="Days 2–4: excursions and early uses" aria-describedby="spiceport-planning-hint" tabindex="0">

```mermaid
%%{init: {"flowchart": {"curve": "linear", "nodeSpacing": 16, "rankSpacing": 20, "padding": 7}, "themeVariables": {"fontSize": "15px"}}}%%
flowchart TD
    accTitle: Days 2–4: excursions and early uses
    accDescr: An activity can remain available after an earlier event that depended on it has passed. Day 4 Warehouse completion does not recover Day 3 preparation. The table below retains exact time-slot information.
    d2["Day 2: two slots, one excursion"]
    d3["Day 3: one solo slot + two-slot excursion"]
    d4["Day 4: one solo slot + last excursion"]
    all["All three excursions can be completed"]
    wEarly["Warehouse Day 2/3: can help early preparation"]
    talk["Day 3 talk: also check closeness and relationship conditions"]
    wLate["Warehouse Day 4: excursion itself still available"]
    miss["Too late for its early use at the Day 3 talk"]
    d2 -->|next day| d3
    d3 -->|next day| d4
    d4 -->|choose an unvisited excursion each time| all
    wEarly -.->|usable preparation; not individually required| talk
    wLate -->|counts toward excursions| all
    wLate --x|early window has passed| miss
    click d2 href "#spiceport-early-excursions" "Day 2: two slots, one excursion" _self
    click d3 href "#spiceport-early-excursions" "Day 3: one solo slot + two-slot excursion" _self
    click d4 href "#spiceport-early-excursions" "Day 4: one solo slot + last excursion" _self
    click all href "#spiceport-early-excursions" "All three excursions can be completed" _self
    click wEarly href "#spiceport-early-excursions" "Warehouse Day 2/3: can help early preparation" _self
    click talk href "../reference/relationships.html#prepare-zhokhar" "Day 3 talk: also check closeness and relationship conditions" _self
    click wLate href "#spiceport-early-excursions" "Warehouse Day 4: excursion itself still available" _self
    click miss href "#spiceport-early-excursions" "Too late for its early use at the Day 3 talk" _self
```

</div>

<p class="kt-map-note">An activity can remain available after an earlier event that depended on it has passed. Day 4 Warehouse completion does not recover Day 3 preparation. The table below retains exact time-slot information.</p>
<details class="kt-map-text-links"><summary>Text links</summary><p><a href="#spiceport-early-excursions">Day 2: two slots, one excursion</a> · <a href="#spiceport-early-excursions">Day 3: one solo slot + two-slot excursion</a> · <a href="#spiceport-early-excursions">Day 4: one solo slot + last excursion</a> · <a href="#spiceport-early-excursions">All three excursions can be completed</a> · <a href="#spiceport-early-excursions">Warehouse Day 2/3: can help early preparation</a> · <a href="../reference/relationships.html#prepare-zhokhar">Day 3 talk: also check closeness and relationship conditions</a> · <a href="#spiceport-early-excursions">Warehouse Day 4: excursion itself still available</a> · <a href="#spiceport-early-excursions">Too late for its early use at the Day 3 talk</a></p></details>
</div>
