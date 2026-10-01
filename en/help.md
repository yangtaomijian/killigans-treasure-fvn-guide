# Help with saves, unlocks, and returning to the game

For Killigan’s Treasure Public v0.57a. Start with the problem you can see; the [journey overview](index.md) and target pages give the steps for individual scenes, items, and relationships.

**Find your symptom:** [No Gallery or Memories menu](#help-menu) · [A Memory is locked](#help-memories-lock) · [An obtained item is missing](#help-item-status) · [Stat icons beside a choice](#help-choice-icons) · [No old save](#help-trailmarkers) · [A Codex page is missing](#help-codex) · [QTE trouble](#help-qte). The [state table](#help-state-table) separates the different kinds of progress.

<a id="help-menu"></a>

## No Gallery or Memories menu?

The Gallery menu opens when you first reach **Redroot Wilds** through normal play. Memories is available from there. If you are already there and still have no menu entry, check your game version and progress; menu behavior on migrated saves has not been verified. If you can see the categories but one entry is locked, use the [next section](#help-memories-lock).

<a id="help-memories-lock"></a>

## I saw the scene. Why is its Memory locked?

Check **NSFW Images** first. At `Off`, Memories marked NSFW cannot be replayed. Switch it back to `On` and check the entry again. If it is still locked, use the [Memories / CG lookup](collectibles/memories.md) to check the conditions, then replay from a regular save before the relevant choice. Older viewing records may not fill in automatically. Several images under one entry still count as one Memory.

**Missing an outfit or expression option?** Check [Dressing Room characters, parts and recovery](collectibles/dressing-room.md#dressing-room-recovery). A single expression can be normal.

<a id="help-item-status"></a>

## I got an item notification, but where is it?

Check by item type. In **Equipment**, look for ownership, equipped status, and damage. Look in **Supplies** for consumables and mementos; later, you can also check the shared trunk. A notification may instead unlock a Dressing Room appearance. The region map list is separate from a **Map** in the inventory. **Check what you are wearing again after a manual repair.** Story rewards are sometimes equipped automatically, so trust the current Equipment screen. Only worn equipment supplies its bonuses. [Look up the specific item](collectibles/equipment.md).

<a id="help-stats"></a>

## Stats, choice icons, and QTEs

**Current stats and equipment:** **Stats** shows the current displayed Brawn, Charm, and Wits values. Worn equipment can affect them; owning an item or unlocking its Dressing Room appearance is not the same as wearing it. Check Stats after changing gear. Some scenes temporarily put equipment away, including the [Blueleaf Grove Day 11 spar](guide/blueleaf-grove.md#blueleaf-day11).

**Camp supplies:** On nights when the game checks camp supplies, skipping dinner may give Brawn −1, an empty waterskin may give Charm −1, and lacking a usable Bedroll may give Wits −1. Check food, water, and your Bedroll before sleeping. Not every story meal has this check.

<a id="help-choice-icons"></a>

**Icons beside choices:** A Brawn, Charm, or Wits **+** icon indicates an increase to that stat. If a notification such as `Brawn +3` appears, use the value shown on screen. A lock-shaped stat icon marks a stat condition; the game screen tells you whether the choice is currently selectable. The **+** icon alone does not tell you the size of the gain or the number needed to unlock a choice.

**Personality is separate:** The Noble, Neutral, and Barbaric direction icons are distinct from those three stats. The same displayed tier does not guarantee the same local choices. See [Personality](reference/personality.md).

<a id="help-qte"></a>

**QTE settings:**

| Setting | What to expect |
|---|---|
| `All` | Standard interactions can all appear. |
| `No Rapids` | Rapid tapping is removed; the corresponding `Tap rapidly!` becomes `Hold till Fully Charged!`. |
| `Random` | Standard interaction outcomes are decided from stats. |
| `None` | Standard interactions succeed automatically. |

These settings do not meet an event's relationship, equipment, or date requirements for you. **Fishing is an exception:** it may still fail on `None`, and `Random` still enters manual fishing. See the [official FAQ](https://itch.io/t/1320696/faq-updated-11302025) for the basic settings. For the consequences of a particular interaction, use its journey section, such as [Spiceport's Day 7 beach and race](guide/spiceport.md#spiceport-day7) or the [Blueleaf Grove Day 11 spar](guide/blueleaf-grove.md#blueleaf-day11). Results vary by event.

If an input succeeds but the action fails, or you are deciding whether to retry, see [Combat & QTEs](reference/combat.md#combat-result).

<a id="help-trailmarkers"></a>

## No old save? Where can I continue?

Start with Eddio's [official guide for returning players and new devices](https://itch.io/t/2741741/returning-player-new-device-click-here), then look at the game's **Trailmarkers** chapter starts. Their preset state lets you continue from a chapter, but **does not rebuild your original items, relationships, or exploration choices**. Memories viewing history and Dressing Room appearances are stored separately, so a Trailmarker does not tell you what those records contain. To compare old branches, use a regular save you made before the choice. Without one, check whether the preset for your chosen start can meet the target page's prerequisites.

<a id="help-codex"></a>

## I have a Codex character entry. Why is a page missing?

The base character or region entry and its **conditional extra pages** are different things. Macsen's **Cute Things He Does** depends on the formal Aris balcony decision; Zhokhar's **Things to Tease About** depends on the Spiceport trial; Blueleaf Grove's **Balls Research (by Mac)** comes from a daytime choice there. The [Codex lookup](collectibles/codex.md#codex-special) lists each page under its in-game tab and entry, with the prerequisite and latest useful save point.

<a id="help-state-table"></a>

## What does each kind of state keep?

| State | What it means |
|---|---|
| Regular save | Current story, relationships, items, and actions. Reload a save before a choice to compare that branch. |
| Memories viewing history | Persistent viewing history used to unlock Memories entries; scene variations belong to their corresponding entries. |
| Dressing Room unlock | Persistent outfit appearance; it does not mean the current save owns the physical item. |
| Equipment owned | A physical item in the current save. Check whether it is actually worn. |
| Equipped / currently worn | Gear on Killigan now, affecting equipment bonuses and some event conditions. |
| Supplies memento | A record of having received something, not wearable equipment with the same name. |
| Shared trunk | Shared storage available later, not a general recovery point during Aris. |
| Trailmarkers | Preset chapter starts, rather than saved progress from your own playthrough. |

## What about a game update?

This guide covers **Public v0.57a**. After an update or device change, check the game version and use the [official returning-player / new-device guide](https://itch.io/t/2741741/returning-player-new-device-click-here) for saves and chapter starts. See the [home-page version information](index.md#site-info).

<a id="ui-details"></a>

## Main-menu details that change with progress

Killigan, Macsen, Taavi, and Zhokhar appear on the title screen as you reach certain journey milestones. Trailmarkers may bring in some of those changes too.

The choice panel also changes its arrangement or entrance animation in the opening, memories, and some conversations.
