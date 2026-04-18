"use strict";

var obsidian = require("obsidian");

/* 
 * Color utilities for light/dark mapping and stepped interpolation
 */

function parseHex(hex) {
	hex = hex.replace(/^#/, "");
	if (hex.length === 3) {
		hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	}
	if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) {
		return null;
	}
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
	};
}

function interpolateColor(cold, hot, t) {
	var r = Math.round(cold.r + (hot.r - cold.r) * t);
	var g = Math.round(cold.g + (hot.g - cold.g) * t);
	var b = Math.round(cold.b + (hot.b - cold.b) * t);
	return (
		"#" +
		r.toString(16).padStart(2, "0") +
		g.toString(16).padStart(2, "0") +
		b.toString(16).padStart(2, "0")
	);
}

function isValidHex(color) {
	return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

function parseRgb(rgbString) {
	// rgb(r, g, b) or rgba(r, g, b, a) format
	var match = rgbString.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	if (!match) return null;
	return {
		r: parseInt(match[1], 10),
		g: parseInt(match[2], 10),
		b: parseInt(match[3], 10),
	};
}

function parseColor(colorString) {
	// hex
	if (colorString.startsWith("#")) {
		return parseHex(colorString);
	}
	// rgb/rgba
	if (colorString.startsWith("rgb")) {
		return parseRgb(colorString);
	}
	return null;
}

function adjustColorBrightness(color, amount) {
	// Adjust brightness positive amount = lighter, negative = darker
	return {
		r: Math.max(0, Math.min(255, color.r + amount)),
		g: Math.max(0, Math.min(255, color.g + amount)),
		b: Math.max(0, Math.min(255, color.b + amount)),
	};
}

function getPerceivedBrightness(color) {
	// Calculate perceived brightness
	return (0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
}

function getThemeBaseColor() {
	// Get background color from theme CSS variables
	var style = getComputedStyle(document.body);

	// Try --background-secondary first
	var bgSecondary = style.getPropertyValue("--background-secondary").trim();
	if (bgSecondary) {
		var color = parseColor(bgSecondary);
		if (color) {
			// Adjust to ensure visibility
			var brightness = getPerceivedBrightness(color);
			// Lighten and darken slightly according to bg
			var adjustment = brightness < 128 ? 10 : -10;
			return adjustColorBrightness(color, adjustment);
		}
	}

	// Fallback --background-primary
	var bgPrimary = style.getPropertyValue("--background-primary").trim();
	if (bgPrimary) {
		var color = parseColor(bgPrimary);
		if (color) {
			var brightness = getPerceivedBrightness(color);
			var adjustment = brightness < 128 ? 15 : -15;
			return adjustColorBrightness(color, adjustment);
		}
	}

	// Fallback to theme-based hardcoded values
	var isDark = document.body.classList.contains("theme-dark");
	return isDark
		? { r: 22, g: 27, b: 34 }   // #161b22
		: { r: 235, g: 237, b: 240 }; // #ebedf0
}

/*
 * Parsing
 */

function parseHeatmapConfig(source) {
	var lines = source.split("\n");
	var fields = {};
	var i = 0;

	while (i < lines.length) {
		var line = lines[i];
		var colonIdx = line.indexOf(":");
		if (colonIdx === -1) {
			i++;
			continue;
		}

		var key = line.slice(0, colonIdx).trim();
		var value = line.slice(colonIdx + 1).trim();

		if (key === "score") {
			var braceCount = 0;
			var started = false;
			var scoreLines = [value];

			for (var c = 0; c < value.length; c++) {
				if (value[c] === "{") { braceCount++; started = true; }
				if (value[c] === "}") { braceCount--; }
			}

			if (started && braceCount > 0) {
				i++;
				while (i < lines.length && braceCount > 0) {
					var scoreLine = lines[i];
					scoreLines.push(scoreLine);
					for (var c = 0; c < scoreLine.length; c++) {
						if (scoreLine[c] === "{") { braceCount++; }
						if (scoreLine[c] === "}") { braceCount--; }
					}
					i++;
				}
			} else {
				i++;
			}

			fields["score"] = scoreLines.join("\n");
		} else {
			var val = value;
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1);
			}
			fields[key] = val;
			i++;
		}
	}

	var errors = [];

	if (!fields["folder"]) {
		errors.push("Missing required field: folder");
	}
	if (!fields["color"]) {
		errors.push("Missing required field: color");
	}
	if (!fields["score"]) {
		errors.push("Missing required field: score");
	}

	if (errors.length > 0) {
		return { errors: errors };
	}

	var color = fields["color"].startsWith("#")
		? fields["color"]
		: "#" + fields["color"];

	if (!isValidHex(color)) {
		errors.push(
			'Invalid color: "' + fields["color"] + '". Must be a valid 3- or 6-digit hex color (e.g. #abc or #aabbcc).'
		);
	}

	var validPositions = ["left", "center", "right"];
	if (fields["navPosition"] && validPositions.indexOf(fields["navPosition"]) === -1) {
		errors.push(
			'Invalid navPosition: "' + fields["navPosition"] + '". Must be one of: left, center, right.'
		);
	}

	if (
		fields["navVisible"] &&
		fields["navVisible"] !== "true" &&
		fields["navVisible"] !== "false"
	) {
		errors.push(
			'Invalid navVisible: "' + fields["navVisible"] + '". Must be true or false.'
		);
	}

	if (fields["score"]) {
		try {
			new Function("props", "return (" + fields["score"] + ")(props)");
		} catch (e) {
			var msg = e instanceof Error ? e.message : String(e);
			errors.push("score function compile error: " + msg);
		}
	}

	if (errors.length > 0) {
		return { errors: errors };
	}

	var navPosition = validPositions.indexOf(fields["navPosition"]) !== -1
		? fields["navPosition"]
		: "left";

	var navVisible = fields["navVisible"] === undefined
		? true
		: fields["navVisible"] === "true";

	return {
		errors: [],
		config: {
			folder: fields["folder"],
			color: color,
			scoreFnBody: fields["score"],
			navPosition: navPosition,
			navVisible: navVisible,
		},
	};
}

/* 
 * Data Manager for data computation and caching
 */

var DEFAULT_SETTINGS = {
	enableCache: true
};

var DataManager = (function () {
	function DataManager(app, plugin) {
		this.app = app;
		this.plugin = plugin;
		this.cache = new Map();
	}

	DataManager.prototype.hashConfig = function (config) {
		// Include actual base color in cache key so theme changes invalidate cache
		var baseColor = getThemeBaseColor();
		var baseColorHex = interpolateColor(baseColor, baseColor, 1); // Convert to hex
		return config.folder + "|" + config.color + "|" + baseColorHex + "|" + config.scoreFnBody;
	};

	DataManager.prototype.invalidateFolder = function (folderPath) {
		for (var key of this.cache.keys()) {
			if (key.includes("|" + folderPath + "|")) {
				this.cache.delete(key);
			}
		}
	};

	DataManager.prototype.invalidateAll = function () {
		this.cache.clear();
	};

	DataManager.prototype.computeData = function (config) {
		var cacheKey = this.hashConfig(config);

		// Check if caching is enabled
		if (this.plugin && this.plugin.settings && this.plugin.settings.enableCache) {
			var cached = this.cache.get(cacheKey);
			if (cached) {
				return cached;
			}
		}

		// Base color from theme CSS variables
		var notesByDate = new Map();
		var warnings = [];
		var baseColor = getThemeBaseColor();
		var targetColor = parseHex(config.color);
		if (!baseColor || !targetColor) {
			warnings.push(
				"Failed to parse color — color could not be resolved."
			);
			var data = { notesByDate: notesByDate, warnings: warnings };
			if (this.plugin && this.plugin.settings && this.plugin.settings.enableCache) {
				this.cache.set(cacheKey, data);
			}
			return data;
		}

		var scoreFn;
		var scoreFnBroken = false;
		try {
			scoreFn = new Function(
				"props",
				"return (" + config.scoreFnBody + ")(props)"
			);
		} catch (e) {
			var msg = e instanceof Error ? e.message : String(e);
			warnings.push("score function compile error: " + msg);
			scoreFn = function () { return 0; };
			scoreFnBroken = true;
		}

		var files = this.app.vault.getFiles().filter(function (f) {
			var parent = (f.parent && f.parent.path) || "";
			return parent === config.folder && f.extension === "md";
		});

		if (files.length === 0 && !scoreFnBroken) {
			warnings.push(
				'Folder "' + config.folder + '" contains no .md files. The heatmap will be empty.'
			);
		}

		for (var i = 0; i < files.length; i++) {
			var file = files[i];
			var ctime = file.stat.ctime;
			var d = new Date(ctime);
			var year = d.getFullYear();
			var month = String(d.getMonth() + 1).padStart(2, "0");
			var day = String(d.getDate()).padStart(2, "0");
			var dateStr = year + "-" + month + "-" + day;

			var fileCache = this.app.metadataCache.getFileCache(file);
			var props = (fileCache && fileCache.frontmatter) || {};

			var score = 0;
			try {
				score = scoreFn(props);
				if (typeof score !== "number" || isNaN(score)) {
					warnings.push(
						'score function returned non-number for "' + file.basename + '" (got ' + String(score) + '). Defaulting to 0.'
					);
					score = 0;
				}
				score = Math.max(0, Math.min(1, score));
			} catch (e) {
				var msg = e instanceof Error ? e.message : String(e);
				warnings.push(
					'score function runtime error on "' + file.basename + '": ' + msg
				);
				score = 0;
			}

			var color = interpolateColor(baseColor, targetColor, score);

			var existing = notesByDate.get(dateStr);
			if (!existing || score > existing.score) {
				notesByDate.set(dateStr, {
					date: dateStr,
					fileName: file.basename,
					score: score,
					color: color,
				});
			}
		}

		var data = { notesByDate: notesByDate, warnings: warnings };
		if (this.plugin && this.plugin.settings && this.plugin.settings.enableCache) {
			this.cache.set(cacheKey, data);
		}
		return data;
	};

	return DataManager;
})();

/*
 * Heatmap Rendering
 */ 

var CELL_SIZE = 11;
var CELL_GAP = 3;
var CELL_STEP = CELL_SIZE + CELL_GAP;
var MONTH_NAMES = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function buildCalendarGrid(year) {
	var cells = [];
	var jan1 = new Date(year, 0, 1);
	var jan1Weekday = (jan1.getDay() + 6) % 7;

	var isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
	var daysInYear = isLeap ? 366 : 365;

	var maxCol = 0;
	var monthStartCols = new Array(12).fill(999);

	for (var d = 0; d < daysInYear; d++) {
		var date = new Date(year, 0, 1 + d);
		var col = Math.floor((d + jan1Weekday) / 7);
		var row = (d + jan1Weekday) % 7;
		var month = date.getMonth();

		var mm = String(month + 1).padStart(2, "0");
		var dd = String(date.getDate()).padStart(2, "0");
		var dateStr = year + "-" + mm + "-" + dd;

		cells.push({ dateStr: dateStr, col: col, row: row, month: month });

		if (col > maxCol) maxCol = col;
		if (col < monthStartCols[month]) {
			monthStartCols[month] = col;
		}
	}

	return { cells: cells, numCols: maxCol + 1, monthStartCols: monthStartCols };
}

// Mount html elements with css and listeners
function renderHeatmap(config, data, initialYear) {
	var currentYear = initialYear;

	var root = document.createElement("div");
	root.className = "dh-container";

	var header = document.createElement("div");
	header.className = "dh-header";
	header.classList.add("dh-header-" + config.navPosition);
	root.appendChild(header);

	var nav = document.createElement("div");
	nav.className = "dh-nav";
	if (!config.navVisible) {
		nav.style.display = "none";
	}
	header.appendChild(nav);

	var prevBtn = document.createElement("button");
	prevBtn.className = "dh-nav-btn";
	prevBtn.textContent = "\u25C0";
	prevBtn.setAttribute("aria-label", "Previous year");
	nav.appendChild(prevBtn);

	var yearLabel = document.createElement("span");
	yearLabel.className = "dh-nav-year";
	yearLabel.textContent = String(currentYear);
	nav.appendChild(yearLabel);

	var nextBtn = document.createElement("button");
	nextBtn.className = "dh-nav-btn";
	nextBtn.textContent = "\u25B6";
	nextBtn.setAttribute("aria-label", "Next year");
	nav.appendChild(nextBtn);

	var scrollWrapper = document.createElement("div");
	scrollWrapper.className = "dh-scroll-wrapper";
	root.appendChild(scrollWrapper);

	var gridWrapper = document.createElement("div");
	gridWrapper.className = "dh-grid-wrapper";
	scrollWrapper.appendChild(gridWrapper);

	var tooltip = document.createElement("div");
	tooltip.className = "dh-tooltip";
	root.appendChild(tooltip);

	var now = new Date();
	var todayStr =
		now.getFullYear() + "-" +
		String(now.getMonth() + 1).padStart(2, "0") + "-" +
		String(now.getDate()).padStart(2, "0");

	function renderGrid() {
		gridWrapper.innerHTML = "";
		yearLabel.textContent = String(currentYear);

		var gridData = buildCalendarGrid(currentYear);
		var cells = gridData.cells;
		var numCols = gridData.numCols;
		var monthStartCols = gridData.monthStartCols;
		var gridPixelWidth = numCols * CELL_STEP - CELL_GAP;

		var monthLabelsRow = document.createElement("div");
		monthLabelsRow.className = "dh-month-labels";
		monthLabelsRow.style.width = gridPixelWidth + "px";
		gridWrapper.appendChild(monthLabelsRow);

		for (var m = 0; m < 12; m++) {
			var label = document.createElement("span");
			label.className = "dh-month-label";
			label.textContent = MONTH_NAMES[m];
			label.style.left = (monthStartCols[m] * CELL_STEP) + "px";
			monthLabelsRow.appendChild(label);
		}

		var grid = document.createElement("div");
		grid.className = "dh-grid";
		grid.style.width = gridPixelWidth + "px";
		grid.style.height = (7 * CELL_STEP - CELL_GAP) + "px";

		var fragment = document.createDocumentFragment();

		for (var i = 0; i < cells.length; i++) {
			var cell = cells[i];
			var el = document.createElement("div");
			el.className = "dh-cell";

			el.style.left = (cell.col * CELL_STEP) + "px";
			el.style.top = (cell.row * CELL_STEP) + "px";

			var noteData = data.notesByDate.get(cell.dateStr);

			if (noteData && noteData.score > 0) {
				el.style.backgroundColor = noteData.color;
				el.dataset.file = noteData.fileName;
				el.classList.add("dh-cell-filled");
			} else {
				var monthNum = cell.month + 1;
				if (monthNum % 2 === 1) {
					el.classList.add("dh-cell-empty", "dh-cell-empty-odd");
				} else {
					el.classList.add("dh-cell-empty", "dh-cell-empty-even");
				}
			}

			if (cell.dateStr === todayStr) {
				el.classList.add("dh-cell-today");
			}

			el.dataset.date = cell.dateStr;
			fragment.appendChild(el);
		}

		grid.appendChild(fragment);
		gridWrapper.appendChild(grid);
	}

	function handleCellEnter(e) {
		var target = e.target;
		if (!target.classList || !target.classList.contains("dh-cell-filled")) return;

		var fileName = target.dataset.file || "";

		tooltip.textContent = fileName;
		tooltip.classList.add("dh-tooltip-visible");

		var cellRect = target.getBoundingClientRect();
		var rootRect = root.getBoundingClientRect();

		var left = cellRect.left - rootRect.left + cellRect.width / 2;
		var top = cellRect.top - rootRect.top - 8;

		tooltip.style.left = left + "px";
		tooltip.style.top = top + "px";
	}

	function handleCellLeave(e) {
		var target = e.target;
		if (!target.classList || !target.classList.contains("dh-cell")) return;
		tooltip.classList.remove("dh-tooltip-visible");
	}

	function onPrev() {
		currentYear--;
		renderGrid();
	}

	function onNext() {
		currentYear++;
		renderGrid();
	}

	prevBtn.addEventListener("click", onPrev);
	nextBtn.addEventListener("click", onNext);
	root.addEventListener("mouseover", handleCellEnter);
	root.addEventListener("mouseout", handleCellLeave);

	renderGrid();

	// Cleanup, Remove listeners upon destruction
	function cleanup() {
		prevBtn.removeEventListener("click", onPrev);
		nextBtn.removeEventListener("click", onNext);
		root.removeEventListener("mouseover", handleCellEnter);
		root.removeEventListener("mouseout", handleCellLeave);
	}

	return {
		root: root,
		cleanup: cleanup,
		getYear: function () { return currentYear; },
	};
}


// Plugin Class

var DanielsHeatmapsPlugin = (function (_super) {
	function DanielsHeatmapsPlugin() {
		var _this = _super.apply(this, arguments) || this;
		_this.activeHeatmaps = new Map();
		return _this;
	}

	Object.setPrototypeOf(DanielsHeatmapsPlugin.prototype, _super.prototype);
	Object.setPrototypeOf(DanielsHeatmapsPlugin, _super);

	DanielsHeatmapsPlugin.prototype.onload = async function () {
		var self = this;

		// Load settings
		var loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// Initialize DataManager with plugin reference
		this.dataManager = new DataManager(this.app, this);

		// Register settings tab
		this.addSettingTab(new HeatmapSettingsTab(this.app, this));

		// Register command to insert heatmap template
		this.addCommand({
			id: "insert-heatmap",
			name: "Insert Heatmap",
			editorCallback: function (editor) {
				var template = '```heatmap\n' +
					'folder: path/to/folder\n' +
					'color: #ff7400\n' +
					'score: (props) => {\n	//Return the average of two frontmatter properties (bool or number)\n		return (props.property1 + props.property2) / 2\n	}\n'+
					'navVisible: true\n' +
					'navPosition: left\n' +
					'```';
				editor.replaceSelection(template);
			}
		});

		this.registerMarkdownCodeBlockProcessor(
			"heatmap",
			function (source, el, ctx) {
				self.processHeatmapBlock(source, el, ctx);
			}
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", function (file) {
				var folder = (file.parent && file.parent.path) || "";
				self.dataManager.invalidateFolder(folder);
				self.rerenderHeatmapsForFolder(folder);
			})
		);

		this.registerEvent(
			this.app.vault.on("create", function (file) {
				if (file instanceof obsidian.TFile) {
					var folder = (file.parent && file.parent.path) || "";
					self.dataManager.invalidateFolder(folder);
					self.rerenderHeatmapsForFolder(folder);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", function (file) {
				if (file instanceof obsidian.TFile) {
					var folder = (file.parent && file.parent.path) || "";
					self.dataManager.invalidateFolder(folder);
					self.rerenderHeatmapsForFolder(folder);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", function (file, oldPath) {
				if (file instanceof obsidian.TFile) {
					var oldFolder = oldPath.substring(0, oldPath.lastIndexOf("/"));
					var newFolder = (file.parent && file.parent.path) || "";
					self.dataManager.invalidateFolder(oldFolder);
					self.dataManager.invalidateFolder(newFolder);
					self.rerenderHeatmapsForFolder(oldFolder);
					self.rerenderHeatmapsForFolder(newFolder);
				}
			})
		);
	};

	DanielsHeatmapsPlugin.prototype.renderErrors = function (el, errors, heading) {
		var wrapper = document.createElement("div");
		wrapper.className = "dh-error";

		var title = document.createElement("div");
		title.className = "dh-error-heading";
		title.textContent = heading;
		wrapper.appendChild(title);

		var list = document.createElement("ul");
		list.className = "dh-error-list";
		for (var i = 0; i < errors.length; i++) {
			var li = document.createElement("li");
			li.textContent = errors[i];
			list.appendChild(li);
		}
		wrapper.appendChild(list);
		el.appendChild(wrapper);
	};

	DanielsHeatmapsPlugin.prototype.renderWarnings = function (container, warnings) {
		var wrapper = document.createElement("div");
		wrapper.className = "dh-warning";

		var title = document.createElement("div");
		title.className = "dh-warning-heading";
		title.textContent = "Heatmap warnings";
		wrapper.appendChild(title);

		var list = document.createElement("ul");
		list.className = "dh-warning-list";
		for (var i = 0; i < warnings.length; i++) {
			var li = document.createElement("li");
			li.textContent = warnings[i];
			list.appendChild(li);
		}
		wrapper.appendChild(list);
		container.appendChild(wrapper);
	};

	DanielsHeatmapsPlugin.prototype.processHeatmapBlock = function (source, el, _ctx) {
		var result = parseHeatmapConfig(source);

		if (result.errors.length > 0 || !result.config) {
			this.renderErrors(
				el,
				result.errors.length > 0 ? result.errors : ["Unknown parse error"],
				"Heatmap configuration error"
			);
			return;
		}

		var config = result.config;

		var folder = this.app.vault.getAbstractFileByPath(config.folder);
		if (!folder) {
			this.renderErrors(
				el,
				[
					'Folder "' + config.folder + '" does not exist in this vault.',
					'Tip: The path is case-sensitive and relative to the vault root (e.g. "Daily Notes/Health").',
				],
				"Heatmap configuration error"
			);
			return;
		}

		var data = this.dataManager.computeData(config);

		if (data.warnings.length > 0) {
			this.renderWarnings(el, data.warnings);
		}

		var currentYear = new Date().getFullYear();
		var rendered = renderHeatmap(config, data, currentYear);

		el.appendChild(rendered.root);

		this.activeHeatmaps.set(el, {
			config: config,
			cleanup: rendered.cleanup,
			getYear: rendered.getYear,
		});
	};

	DanielsHeatmapsPlugin.prototype.rerenderHeatmapsForFolder = function (folder) {
		for (var entry_arr of this.activeHeatmaps) {
			var el = entry_arr[0];
			var entry = entry_arr[1];

			if (entry.config.folder !== folder) continue;

			if (!el.isConnected) {
				entry.cleanup();
				this.activeHeatmaps.delete(el);
				continue;
			}

			var year = entry.getYear();
			entry.cleanup();

			while (el.firstChild) {
				el.removeChild(el.firstChild);
			}

			var data = this.dataManager.computeData(entry.config);
			var rendered = renderHeatmap(entry.config, data, year);
			el.appendChild(rendered.root);

			this.activeHeatmaps.set(el, {
				config: entry.config,
				cleanup: rendered.cleanup,
				getYear: rendered.getYear,
			});
		}
	};

	DanielsHeatmapsPlugin.prototype.onunload = function () {
		for (var entry_arr of this.activeHeatmaps) {
			entry_arr[1].cleanup();
		}
		this.activeHeatmaps.clear();
		this.dataManager.invalidateAll();
	};

	return DanielsHeatmapsPlugin;
})(obsidian.Plugin);

/* 
 * Community Plugins Settings Tab
 *
 * - Toggle caching
 */

var HeatmapSettingsTab = (function (_super) {
	function HeatmapSettingsTab(app, plugin) {
		var _this = _super.call(this, app, plugin) || this;
		_this.plugin = plugin;
		return _this;
	}

	Object.setPrototypeOf(HeatmapSettingsTab.prototype, _super.prototype);
	Object.setPrototypeOf(HeatmapSettingsTab, _super);

	HeatmapSettingsTab.prototype.display = function () {
		var containerEl = this.containerEl;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Heatmap Settings" });

		var self = this;

		new obsidian.Setting(containerEl)
			.setName("Enable caching")
			.setDesc("Cache computed heatmap data to improve performance. Disable if experiencing issues.")
			.addToggle(function (toggle) {
				return toggle
					.setValue(self.plugin.settings.enableCache)
					.onChange(async function (value) {
						self.plugin.settings.enableCache = value;
						await self.plugin.saveData(self.plugin.settings);
						if (!value) {
							self.plugin.dataManager.invalidateAll();
						}
					});
			});
	};

	return HeatmapSettingsTab;
})(obsidian.PluginSettingTab);


/*
 * Module Exports
 */

module.exports = DanielsHeatmapsPlugin;
module.exports.default = DanielsHeatmapsPlugin;
