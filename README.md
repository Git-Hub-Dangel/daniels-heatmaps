# Daniel's Heatmaps

Foster consistency with intuitive and configurable data-driven heatmaps that support custom frontmatter properties, colour themes, and limitless functionality customisation with JavaScript scoring formulas.

## Showcase
Heatmaps are compatible with any theme background color and support dark/light appearance.

![[Showcase Banner]](/images/banner.png)

![[Showcase Banner Yellow]](/images/banner-yellow-heatmap.png)

## How to Install
Download the `/daniels-heatmaps` folder from within this repository from GitHub and deposit it as folder within your Obsidian vault under `{Vault Name}/.obsidian/plugins/`. Then, enable the plugin within the Community Plugins section, where it should by now already show as installed.

If the Obsidian-team approves this plugin, it will be available in the Community Plugins browser within Obsidian :^)

## Documentation

### Creating your first Heatmap

You can create your heatmap by either typing out an inline code-block of type "heatmap" manually, or just using the `Insert Heatmap` command. It deposits a readily configurable heatmap snippet in your note.

![[Command]](/images/command.png)


### Properties
You can orchestrate the heatmap to fit your indiviual requirements using its available properties. Here's a brief overview of them

![[Inline Code]](/images/inline-code-example.png)

#### Required Properties
- `folder [string]` Path to folder containing your notes. The heatmap uses the Obsidian-internal creation timestamp of notes instead of any frontmatter properties. (So that when you miss a day completely, you will be held accountable for it in the heatmap >:)
- `color [string]` Hex color, with which entries with a full score are assigned. Color shades for lesser scores are automatically generated off this color.
- `score [function]` Arrow function that must return a score value between `0` and `1`. Algorhytm to get there is freely customisable in JavaScript. All frontmatter fields of the notes in your specified `folder` can be accessed through the `props` element via `props.propertyName`, or `props["property name"]`. The latter is compatible with multi-word property labels and therefore recommended. See [this section](#scoring-algorithm-examples) for compact examples.

#### Optional Properties
- `navVisible [boolean]` Toggle visibility of the year navigator above the heatmap. (default: `true`)
- `navPosition [string]` Adjust navigator position: `left`, `center`, or `right` (default: `left`)

### Settings
#### Caching
Heatmaps cache data to improve performance. By default, caching is recommended to be kept enabled. You can toggle `caching` in the plugin's settings menu.

**With caching**, heatmap data is computed once per unique configuration with the cache automatically invalidating changes in notes.

## Troubleshooting

![Inline Error](/images/error-logging.png)

If the heatmap does not render, an inline error is shown inside the code block with the exact cause. Common issues:

| Error | Fix |
|-------|-----|
| *Missing required field: folder* | Add a `folder:` line pointing to a valid vault path. |
| *Missing required field: color* | Add a `color:` field as a hex value (e.g. `#196127`). |
| *Missing required field: score* | Add a `score:` arrow function. |
| *Invalid navPosition* | Must be one of: `left`, `center`, `right`. |
| *Invalid navVisible* | Must be `true` or `false`. |
| *Invalid color* | Use a valid 3- or 6-digit hex color starting with `#`. |
| *Folder "…" does not exist* | Check the folder path matches an existing vault folder exactly (case-sensitive). |
| *score function compile error* | Check for syntax errors in the arrow function body. The error message includes details. |
| *score function runtime error on "file.md"* | The function threw when processing a specific note. The error is shown with the filename. |
| Grid appears but all cells are base-colored | Verify the frontmatter keys your score function reads actually exist in the notes. |
| Heatmap shows outdated data | Restart Obsidian. If that doesn't fix it, try disabling caching in Settings "Daniel's Heatmaps". If that fixes it, re-enable caching after confirming data updates. |

## Examples
### Scoring Algorithm Examples
**Binary (note exists = full color):**
```
score: (props) => { return 1; }
```

**Read a frontmatter field:**
```
score: (props) => {
  const mood = Number(props["mood"] ?? 0);
  return Math.min(mood / 10, 1);
}
```

**Combine multiple fields:**
```
score: (props) => {
  const water = Number(props["water_litres"] ?? 0);
  const exercise = props["exercised"] ? 0.5 : 0;
  return Math.min(water / 3 + exercise, 1);
}
```
### More Visual Aid
Light mode with navigation enabled hovering over a past entry.

![Light with Navigation](/images/light-heatmap-tooltip.png)

Light mode in the most minimal configuration

![Light Minimal](/images/light-heatmap-noNav.png)