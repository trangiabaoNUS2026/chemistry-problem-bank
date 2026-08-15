// ---------------------------------------------------------------------
// Chemistry Olympiad Problem Catalog — app.js
// Vanilla JS, no build step. Fetches data/problems.json + data/taxonomy.json,
// renders a filterable/sortable Table, Board (card), or Stats view, a
// coverage overview, and opens PDFs in a new tab via viewer.html.
// ---------------------------------------------------------------------

(function () {
  "use strict";

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------
  var allProblems = [];        // full dataset, unfiltered
  var taxonomy = { olympiads: [], subsets: [], types: [] };
  var currentView = localStorage.getItem("catalog-view") || "table";
  var currentColorTheme = localStorage.getItem("catalog-color-theme") || "professional";
  var currentSort = {
    field: localStorage.getItem("catalog-sort-field") || "id",
    direction: localStorage.getItem("catalog-sort-direction") || "asc"
  };
  var lastFilteredProblems = []; // kept in sync so Stats can re-render on view switch

  // Multi-select field config: key -> Set of currently checked values
  // (Theme/Keyword is free-text search, not a checklist — see filter bar.)
  var multiSelectState = {
    subset: new Set(),
    skills: new Set(),
    target_molecules: new Set()
  };

  // -----------------------------------------------------------------
  // DOM refs
  // -----------------------------------------------------------------
  var el = {
    tbody: document.getElementById("problems-tbody"),
    boardGrid: document.getElementById("board-grid"),
    coverageGrid: document.getElementById("coverage-grid"),
    resultsCount: document.getElementById("results-count"),
    emptyState: document.getElementById("empty-state"),
    viewTable: document.getElementById("view-table"),
    viewBoard: document.getElementById("view-board"),
    viewStats: document.getElementById("view-stats"),
    viewToggle: document.getElementById("view-toggle"),
    themeToggle: document.getElementById("theme-toggle"),
    clearBtn: document.getElementById("clear-filters-btn"),

    filterId: document.getElementById("filter-id"),
    filterTitle: document.getElementById("filter-title"),
    filterNation: document.getElementById("filter-nation"),
    filterOlympiad: document.getElementById("filter-olympiad"),
    filterCategory: document.getElementById("filter-category"),
    filterYear: document.getElementById("filter-year"),
    filterType: document.getElementById("filter-type"),
    filterTheme: document.getElementById("filter-theme"),

    sortField: document.getElementById("sort-field"),
    sortDirectionBtn: document.getElementById("sort-direction-btn"),
    sortDirectionLabel: document.getElementById("sort-direction-label"),

    statsSummary: document.getElementById("stats-summary"),
    statsChart: document.getElementById("stats-chart"),
    statsSubsetBreakdown: document.getElementById("stats-subset-breakdown")
  };

  var multiSelectConfig = [
    { key: "subset", containerId: "multi-subset", label: "subsets" },
    { key: "skills", containerId: "multi-skills", label: "skills" },
    { key: "target_molecules", containerId: "multi-target_molecules", label: "molecules" }
  ];

  // -----------------------------------------------------------------
  // Category detection (Official vs Prep).
  // Uses an explicit "category" field if present; otherwise infers
  // from the problem's id (looks for "prep", case-insensitive). This
  // means it works immediately on existing data with no migration —
  // add an explicit category field later for anything string-matching
  // gets wrong.
  // -----------------------------------------------------------------
  function getCategory(problem) {
    if (problem.category) return problem.category;
    var haystack = (String(problem.id || "") + " " + String(problem.olympiad || "")).toLowerCase();
    return haystack.indexOf("prep") !== -1 ? "Prep" : "Official";
  }

  function buildCategoryBadgeHtml(problem) {
    var cat = getCategory(problem);
    var cls = cat === "Prep" ? "category-badge category-badge--prep" : "category-badge category-badge--official";
    return '<span class="' + cls + '">' + escapeHtml(cat) + "</span>";
  }

  // -----------------------------------------------------------------
  // Subset color system (dot-chip color-coding). Deterministic: same
  // name always hashes to the same color.
  // -----------------------------------------------------------------
  var TILE_COLOR_COUNT = 10; // matches --tile-0 .. --tile-9 in style.css

  function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function tileColorVar(name) {
    var index = hashString(name) % TILE_COLOR_COUNT;
    return "var(--tile-" + index + ")";
  }

  function buildSubsetChipHtml(subsetName) {
    var color = tileColorVar(subsetName);
    var label = escapeHtml(subsetName);
    return (
      '<span class="subset-chip" style="--tile-color:' + color + '">' +
      '<span class="chip-dot"></span>' + label +
      "</span>"
    );
  }

  // -----------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------
  function loadData() {
    Promise.all([
      fetch("data/problems.json").then(handleFetchResponse),
      fetch("data/taxonomy.json").then(handleFetchResponse)
    ])
      .then(function (results) {
        allProblems = Array.isArray(results[0]) ? results[0] : [];
        taxonomy = results[1] || { olympiads: [], subsets: [], types: [] };

        populateStaticFilterOptions();
        populateDynamicFilterOptions();
        populateMultiSelects();
        attachFilterListeners();
        attachSortListeners();
        attachViewToggleListeners();
        attachColorThemeToggleListeners();
        applyView(currentView);
        applyColorTheme(currentColorTheme);
        updateSortDirectionUI();
        renderCoveragePanel();
        applyFilters();
      })
      .catch(function (err) {
        showLoadError(err);
      });
  }

  function handleFetchResponse(response) {
    if (!response.ok) {
      throw new Error("Failed to load " + response.url + " (" + response.status + ")");
    }
    return response.json();
  }

  function showLoadError(err) {
    console.error("Catalog data failed to load:", err);
    if (el.viewTable) el.viewTable.hidden = true;
    if (el.viewBoard) el.viewBoard.hidden = true;
    if (el.viewStats) el.viewStats.hidden = true;
    el.emptyState.hidden = false;
    el.emptyState.textContent =
      "Could not load the problem catalog data. Please try refreshing the page.";
    el.resultsCount.textContent = "0 results";
  }

  // -----------------------------------------------------------------
  // Color theme toggle (Professional / Nebula)
  // -----------------------------------------------------------------
  function attachColorThemeToggleListeners() {
    el.themeToggle.querySelectorAll(".theme-toggle-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyColorTheme(btn.getAttribute("data-theme"));
      });
    });
  }

  function applyColorTheme(theme) {
    currentColorTheme = theme;
    localStorage.setItem("catalog-color-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);

    el.themeToggle.querySelectorAll(".theme-toggle-btn").forEach(function (btn) {
      var isActive = btn.getAttribute("data-theme") === theme;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  // -----------------------------------------------------------------
  // View toggle (Table / Board / Stats)
  // -----------------------------------------------------------------
  function attachViewToggleListeners() {
    el.viewToggle.querySelectorAll(".view-toggle-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyView(btn.getAttribute("data-view"));
      });
    });
  }

  function applyView(view) {
    currentView = view;
    localStorage.setItem("catalog-view", view);

    el.viewToggle.querySelectorAll(".view-toggle-btn").forEach(function (btn) {
      var isActive = btn.getAttribute("data-view") === view;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    el.viewTable.hidden = view !== "table";
    el.viewBoard.hidden = view !== "board";
    el.viewStats.hidden = view !== "stats";

    // Stats is built from the last filtered set; re-render fresh each
    // time it's switched into, in case filters changed while on
    // another view (cheap enough to just always redo it here).
    if (view === "stats") {
      renderStats(lastFilteredProblems);
    }
  }

  // -----------------------------------------------------------------
  // Sorting
  // -----------------------------------------------------------------
  function attachSortListeners() {
    el.sortField.value = currentSort.field;
    el.sortField.addEventListener("change", function () {
      currentSort.field = el.sortField.value;
      localStorage.setItem("catalog-sort-field", currentSort.field);
      applyFilters();
    });

    el.sortDirectionBtn.addEventListener("click", function () {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
      localStorage.setItem("catalog-sort-direction", currentSort.direction);
      updateSortDirectionUI();
      applyFilters();
    });
  }

  function updateSortDirectionUI() {
    el.sortDirectionBtn.setAttribute("data-direction", currentSort.direction);
    el.sortDirectionLabel.textContent = currentSort.direction === "asc" ? "Ascending" : "Descending";
  }

  function applySort(problems) {
    var field = currentSort.field;
    var dir = currentSort.direction === "desc" ? -1 : 1;

    return problems.slice().sort(function (a, b) {
      var av = a[field];
      var bv = b[field];

      if (field === "year") {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
        return (av - bv) * dir;
      }

      av = String(av || "").toLowerCase();
      bv = String(bv || "").toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  // -----------------------------------------------------------------
  // Coverage panel — one card per (Olympiad, Category) pair — e.g.
  // "IChO" Official and "IChO" Prep are tracked as separate series,
  // since that's the meaningful unit now. Each card shows its year
  // range(s), a gap-aware dot-strip, and a problem count. Clicking a
  // card jumps the Olympiad + Category filters straight to it.
  // -----------------------------------------------------------------
  function renderCoveragePanel() {
    var groups = {}; // "olympiad||category" -> { olympiad, category, years: Set, count }

    allProblems.forEach(function (p) {
      if (!p.olympiad) return;
      var cat = getCategory(p);
      var key = p.olympiad + "||" + cat;
      if (!groups[key]) {
        groups[key] = { olympiad: p.olympiad, category: cat, years: new Set(), count: 0 };
      }
      if (p.year) groups[key].years.add(Number(p.year));
      groups[key].count += 1;
    });

    var keys = Object.keys(groups).sort();
    if (keys.length === 0) {
      el.coverageGrid.innerHTML =
        '<p class="keyword-text">No olympiads in the catalog yet.</p>';
      return;
    }

    el.coverageGrid.innerHTML = keys.map(function (key) {
      return buildCoverageCardHtml(groups[key]);
    }).join("");

    el.coverageGrid.querySelectorAll("[data-coverage-olympiad]").forEach(function (card) {
      card.addEventListener("click", function () {
        el.filterOlympiad.value = card.getAttribute("data-coverage-olympiad");
        el.filterCategory.value = card.getAttribute("data-coverage-category");
        applyFilters();
        var filterBar = document.getElementById("filter-bar");
        if (filterBar) filterBar.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function buildCoverageCardHtml(group) {
    var years = Array.from(group.years).sort(function (a, b) { return a - b; });
    var accentColor = group.category === "Prep" ? "var(--cat-prep)" : "var(--cat-official)";
    var badge = group.category === "Prep"
      ? '<span class="category-badge category-badge--prep">Prep</span>'
      : '<span class="category-badge category-badge--official">Official</span>';

    var rangeAndDots;
    if (years.length === 0) {
      rangeAndDots = '<span class="coverage-card-range">No years recorded</span>';
    } else {
      var min = years[0];
      var max = years[years.length - 1];
      var yearSet = new Set(years);
      var rangeLabel = formatYearRanges(years);

      var dots = [];
      for (var y = min; y <= max; y++) {
        var present = yearSet.has(y);
        dots.push(
          '<span class="coverage-dot' + (present ? "" : " is-gap") + '" title="' + y + (present ? "" : " — not yet in catalog") + '"></span>'
        );
      }
      rangeAndDots =
        '<span class="coverage-card-range">' + escapeHtml(rangeLabel) + "</span>" +
        '<div class="coverage-dots">' + dots.join("") + "</div>";
    }

    return (
      '<button type="button" class="coverage-card" style="--tile-color:' + accentColor + '" ' +
      'data-coverage-olympiad="' + escapeHtml(group.olympiad) + '" ' +
      'data-coverage-category="' + escapeHtml(group.category) + '">' +
      '<div class="coverage-card-top">' +
      '<span class="coverage-card-name-group">' +
      '<span class="coverage-card-name">' + escapeHtml(group.olympiad) + "</span>" + badge +
      "</span>" +
      '<span class="coverage-card-count">' + group.count + (group.count === 1 ? " problem" : " problems") + "</span>" +
      "</div>" +
      rangeAndDots +
      "</button>"
    );
  }

  // Collapses a sorted array of years into contiguous ranges, e.g.
  // [1968..1975, 1977..2025] -> "1968–1975, 1977–2025"
  function formatYearRanges(sortedYears) {
    var ranges = [];
    var start = sortedYears[0];
    var prev = sortedYears[0];

    for (var i = 1; i < sortedYears.length; i++) {
      if (sortedYears[i] === prev + 1) {
        prev = sortedYears[i];
        continue;
      }
      ranges.push([start, prev]);
      start = sortedYears[i];
      prev = sortedYears[i];
    }
    ranges.push([start, prev]);

    return ranges
      .map(function (r) { return r[0] === r[1] ? String(r[0]) : r[0] + "–" + r[1]; })
      .join(", ");
  }

  // -----------------------------------------------------------------
  // Filter option population
  // -----------------------------------------------------------------
  function populateStaticFilterOptions() {
    fillSelect(el.filterType, taxonomy.types || []);
  }

function populateDynamicFilterOptions() {
    var nations = distinctValues(allProblems, "nation");
    var olympiads = distinctValues(allProblems, "olympiad"); // Extract dynamic olympiads[cite: 2]
    var years = distinctValues(allProblems, "year").sort(function (a, b) {
      return a - b;
    });
    fillSelect(el.filterNation, nations);
    fillSelect(el.filterOlympiad, olympiads); // Populate the dropdown dynamically[cite: 2]
    fillSelect(el.filterYear, years);
  }

  function fillSelect(selectEl, values) {
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    });
  }

  function distinctValues(problems, field) {
    var set = new Set();
    problems.forEach(function (p) {
      if (p[field] !== undefined && p[field] !== null && p[field] !== "") {
        set.add(p[field]);
      }
    });
    return Array.from(set).sort();
  }

  function distinctArrayValues(problems, field) {
    var set = new Set();
    problems.forEach(function (p) {
      var arr = p[field];
      if (Array.isArray(arr)) {
        arr.forEach(function (v) {
          if (v) set.add(v);
        });
      }
    });
    return Array.from(set).sort();
  }

  // -----------------------------------------------------------------
  // Multi-select popovers (Subset / Skills / Target Molecule)
  // -----------------------------------------------------------------
  function populateMultiSelects() {
    multiSelectConfig.forEach(function (cfg) {
      var container = document.getElementById(cfg.containerId);
      var panel = container.querySelector(".multi-select-panel");
      var toggle = container.querySelector(".multi-select-toggle");

      var options =
        cfg.key === "subset"
          ? (taxonomy.subsets || [])
          : distinctArrayValues(allProblems, cfg.key);

      options.forEach(function (value) {
        var id = "opt-" + cfg.key + "-" + slug(value);

        var wrapper = document.createElement("label");
        wrapper.className = "multi-select-option";
        wrapper.setAttribute("for", id);

        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = id;
        checkbox.value = value;

        checkbox.addEventListener("change", function () {
          if (checkbox.checked) {
            multiSelectState[cfg.key].add(value);
          } else {
            multiSelectState[cfg.key].delete(value);
          }
          updateMultiSelectToggleLabel(cfg, toggle);
          applyFilters();
        });

        var text = document.createTextNode(" " + value);

        wrapper.appendChild(checkbox);
        wrapper.appendChild(text);
        panel.appendChild(wrapper);
      });

      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOpen = !panel.hidden;
        closeAllMultiSelectPanels();
        if (!isOpen) panel.hidden = false;
      });
    });

    document.addEventListener("click", function (e) {
      multiSelectConfig.forEach(function (cfg) {
        var container = document.getElementById(cfg.containerId);
        if (!container.contains(e.target)) {
          container.querySelector(".multi-select-panel").hidden = true;
        }
      });
    });
  }

  function closeAllMultiSelectPanels() {
    multiSelectConfig.forEach(function (cfg) {
      document
        .getElementById(cfg.containerId)
        .querySelector(".multi-select-panel").hidden = true;
    });
  }

  function updateMultiSelectToggleLabel(cfg, toggle) {
    var count = multiSelectState[cfg.key].size;
    toggle.textContent = count === 0 ? "All " + cfg.label : count + " " + cfg.label + " selected";
  }

  function slug(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // -----------------------------------------------------------------
  // Filter listeners
  // -----------------------------------------------------------------
  function attachFilterListeners() {
    [el.filterId, el.filterTitle, el.filterTheme].forEach(function (input) {
      input.addEventListener("input", applyFilters);
    });
    [el.filterNation, el.filterOlympiad, el.filterCategory, el.filterYear, el.filterType].forEach(function (sel) {
      sel.addEventListener("change", applyFilters);
    });
    el.clearBtn.addEventListener("click", clearAllFilters);
  }

  function clearAllFilters() {
    el.filterId.value = "";
    el.filterTitle.value = "";
    el.filterNation.value = "";
    el.filterOlympiad.value = "";
    el.filterCategory.value = "";
    el.filterYear.value = "";
    el.filterType.value = "";
    el.filterTheme.value = "";

    multiSelectConfig.forEach(function (cfg) {
      multiSelectState[cfg.key].clear();
      var container = document.getElementById(cfg.containerId);
      container.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.checked = false;
      });
      updateMultiSelectToggleLabel(cfg, container.querySelector(".multi-select-toggle"));
    });

    applyFilters();
  }

  // -----------------------------------------------------------------
  // Core filter-matching logic
  // -----------------------------------------------------------------
  function problemMatchesFilters(problem, filters) {
    if (filters.id && !String(problem.id || "").toLowerCase().includes(filters.id)) {
      return false;
    }
    if (filters.title && !String(problem.title || "").toLowerCase().includes(filters.title)) {
      return false;
    }
    if (filters.themeKeyword) {
      var themeValues = Array.isArray(problem.theme) ? problem.theme : [];
      var themeMatch = themeValues.some(function (t) {
        return String(t).toLowerCase().includes(filters.themeKeyword);
      });
      if (!themeMatch) return false;
    }

    if (filters.nation && String(problem.nation) !== filters.nation) return false;
    if (filters.olympiad && String(problem.olympiad) !== filters.olympiad) return false;
    if (filters.category && getCategory(problem) !== filters.category) return false;
    if (filters.year && String(problem.year) !== filters.year) return false;
    if (filters.type && String(problem.type) !== filters.type) return false;

    for (var i = 0; i < multiSelectConfig.length; i++) {
      var cfg = multiSelectConfig[i];
      var selected = multiSelectState[cfg.key];
      if (selected.size === 0) continue;

      var problemValues = Array.isArray(problem[cfg.key]) ? problem[cfg.key] : [];
      var hasAnyMatch = problemValues.some(function (v) {
        return selected.has(v);
      });
      if (!hasAnyMatch) return false;
    }

    return true;
  }

  function getActiveFilters() {
    return {
      id: el.filterId.value.trim().toLowerCase(),
      title: el.filterTitle.value.trim().toLowerCase(),
      themeKeyword: el.filterTheme.value.trim().toLowerCase(),
      nation: el.filterNation.value,
      olympiad: el.filterOlympiad.value,
      category: el.filterCategory.value,
      year: el.filterYear.value,
      type: el.filterType.value
    };
  }

  function applyFilters() {
    var filters = getActiveFilters();
    var filtered = allProblems.filter(function (p) {
      return problemMatchesFilters(p, filters);
    });
    filtered = applySort(filtered);
    lastFilteredProblems = filtered;
    renderResults(filtered);
  }

  // -----------------------------------------------------------------
  // Rendering — Table + Board are both built every time (cheap even
  // at a few thousand rows), so switching views is instant. Stats is
  // rendered separately, only when active, from the same filtered set.
  // -----------------------------------------------------------------
  function renderResults(problems) {
    el.resultsCount.textContent = problems.length + " results";

    if (problems.length === 0) {
      el.tbody.innerHTML = "";
      el.boardGrid.innerHTML = "";
      el.viewTable.hidden = true;
      el.viewBoard.hidden = true;
      el.viewStats.hidden = true;
      el.emptyState.hidden = false;
      el.emptyState.textContent = "No problems match these filters.";
      if (currentView === "stats") renderStats(problems);
      return;
    }

    el.emptyState.hidden = true;
    applyView(currentView);

    el.tbody.innerHTML = problems.map(buildRowHtml).join("");
    el.boardGrid.innerHTML = problems.map(buildCardHtml).join("");

    wireActionButtons(el.tbody);
    wireActionButtons(el.boardGrid);
  }

  function wireActionButtons(container) {
    container.querySelectorAll("[data-action='view-problem']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPdfInNewTab(btn, "problem");
      });
    });
    container.querySelectorAll("[data-action='view-solution']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPdfInNewTab(btn, "solution");
      });
    });
  }

  function buildRowHtml(problem) {
    var subsetChips = (problem.subset || []).map(buildSubsetChipHtml).join("");
    var keywordText = (problem.theme || []).join(", ");
    var categoryBadge = buildCategoryBadgeHtml(problem);

    var hasProblemPdf = !!problem.problem_pdf;
    var hasSolutionPdf = !!problem.solution_pdf;

    var problemBtn = hasProblemPdf
      ? '<button type="button" class="btn" data-action="view-problem" data-id="' +
        escapeHtml(problem.id) +
        '">View Problem</button>'
      : '<button type="button" class="btn btn-disabled" disabled>View Problem</button>';

    var solutionBtn = hasSolutionPdf
      ? '<button type="button" class="btn" data-action="view-solution" data-id="' +
        escapeHtml(problem.id) +
        '">View Solution</button>'
      : '<button type="button" class="btn btn-disabled" disabled>View Solution</button>';

    return (
      "<tr>" +
      '<td class="cell-id" data-label="ID">' + escapeHtml(problem.id) + "</td>" +
      '<td data-label="Title">' + escapeHtml(problem.title) + "</td>" +
      '<td data-label="Nation">' + escapeHtml(problem.nation) + "</td>" +
      '<td data-label="Olympiad">' + escapeHtml(problem.olympiad) + "</td>" +
      '<td data-label="Category">' + categoryBadge + "</td>" +
      '<td class="cell-year" data-label="Year">' + escapeHtml(problem.year) + "</td>" +
      '<td data-label="Subset"><span class="chip-row">' + subsetChips + "</span></td>" +
      '<td data-label="Theme / Keywords"><span class="keyword-text">' + escapeHtml(keywordText) + "</span></td>" +
      '<td data-label="Type">' + escapeHtml(problem.type) + "</td>" +
      '<td class="actions-cell" data-label="Actions">' + problemBtn + solutionBtn + "</td>" +
      "</tr>"
    );
  }

  function buildCardHtml(problem) {
    var primarySubset = (problem.subset && problem.subset[0]) || null;
    var accentColor = primarySubset ? tileColorVar(primarySubset) : "var(--accent)";
    var subsetChips = (problem.subset || []).map(buildSubsetChipHtml).join("");
    var keywordText = (problem.theme || []).join(", ");
    var categoryBadge = buildCategoryBadgeHtml(problem);

    var hasProblemPdf = !!problem.problem_pdf;
    var hasSolutionPdf = !!problem.solution_pdf;

    var problemBtn = hasProblemPdf
      ? '<button type="button" class="btn" data-action="view-problem" data-id="' +
        escapeHtml(problem.id) +
        '">View Problem</button>'
      : '<button type="button" class="btn btn-disabled" disabled>View Problem</button>';

    var solutionBtn = hasSolutionPdf
      ? '<button type="button" class="btn" data-action="view-solution" data-id="' +
        escapeHtml(problem.id) +
        '">View Solution</button>'
      : '<button type="button" class="btn btn-disabled" disabled>View Solution</button>';

    return (
      '<article class="problem-card" style="--tile-color:' + accentColor + '">' +
      '<div class="card-top">' +
      '<span class="card-top-left"><span class="card-id">' + escapeHtml(problem.id) + "</span>" + categoryBadge + "</span>" +
      '<span class="card-year">' + escapeHtml(problem.year) + "</span>" +
      "</div>" +
      '<h3 class="card-title">' + escapeHtml(problem.title) + "</h3>" +
      '<div class="card-meta">' +
      '<span>' + escapeHtml(problem.olympiad) + "</span>" +
      '<span class="dot">' + escapeHtml(problem.nation) + "</span>" +
      '<span class="dot">' + escapeHtml(problem.type) + "</span>" +
      "</div>" +
      '<span class="chip-row">' + subsetChips + "</span>" +
      (keywordText ? '<p class="card-keywords">' + escapeHtml(keywordText) + "</p>" : "") +
      '<div class="card-actions">' + problemBtn + solutionBtn + "</div>" +
      "</article>"
    );
  }

  // -----------------------------------------------------------------
  // Stats view — summary tiles, an animated stacked bar chart of
  // problems per year (Official vs Prep), and a subset breakdown.
  // Computed from whatever is currently filtered, so it doubles as a
  // live breakdown tool, not just a fixed overview.
  // -----------------------------------------------------------------
  function computeStats(problems) {
    var totals = { total: problems.length, official: 0, prep: 0 };
    var byYearCategory = {};
    var bySubset = {};
    var yearsSet = new Set();
    var subsetsSet = new Set();

    problems.forEach(function (p) {
      var cat = getCategory(p);
      if (cat === "Prep") totals.prep += 1; else totals.official += 1;

      if (p.year) {
        var y = Number(p.year);
        yearsSet.add(y);
        if (!byYearCategory[y]) byYearCategory[y] = { Official: 0, Prep: 0 };
        byYearCategory[y][cat] = (byYearCategory[y][cat] || 0) + 1;
      }

      (p.subset || []).forEach(function (s) {
        subsetsSet.add(s);
        bySubset[s] = (bySubset[s] || 0) + 1;
      });
    });

    return {
      totals: totals,
      byYearCategory: byYearCategory,
      bySubset: bySubset,
      yearsCovered: yearsSet.size,
      subsetsCovered: subsetsSet.size
    };
  }

  function renderStats(problems) {
    var stats = computeStats(problems);
    el.statsSummary.innerHTML = buildStatsSummaryHtml(stats);
    el.statsChart.innerHTML = buildBarChartSvg(stats.byYearCategory);
    el.statsSubsetBreakdown.innerHTML = buildSubsetBreakdownHtml(stats.bySubset);
  }

  function buildStatsSummaryHtml(stats) {
    var tiles = [
      { label: "Total Problems", value: stats.totals.total },
      { label: "Official", value: stats.totals.official },
      { label: "Prep", value: stats.totals.prep },
      { label: "Years Covered", value: stats.yearsCovered },
      { label: "Subsets Touched", value: stats.subsetsCovered }
    ];
    return tiles.map(function (t) {
      return (
        '<div class="stat-tile"><span class="stat-tile-value">' + t.value +
        '</span><span class="stat-tile-label">' + escapeHtml(t.label) + "</span></div>"
      );
    }).join("");
  }

  function buildBarChartSvg(byYearCategory) {
    var years = Object.keys(byYearCategory).map(Number).sort(function (a, b) { return a - b; });
    if (years.length === 0) {
      return '<p class="keyword-text">No year data for the current filters.</p>';
    }

    var barWidth = 14;
    var gap = 6;
    var chartHeight = 190;
    var labelSpace = 20;

    var maxTotal = 1;
    years.forEach(function (y) {
      var d = byYearCategory[y];
      var t = (d.Official || 0) + (d.Prep || 0);
      if (t > maxTotal) maxTotal = t;
    });

    var chartWidth = years.length * (barWidth + gap);
    var parts = [];

    years.forEach(function (y, idx) {
      var d = byYearCategory[y];
      var off = d.Official || 0;
      var prep = d.Prep || 0;
      var offH = Math.round((off / maxTotal) * chartHeight);
      var prepH = Math.round((prep / maxTotal) * chartHeight);
      var x = idx * (barWidth + gap);
      var officialTopY = chartHeight - offH;
      var prepTopY = officialTopY - prepH;
      var delay = Math.min(idx * 4, 300);

      parts.push('<g>');
      if (off > 0) {
        parts.push(
          '<rect class="bar-segment bar-official" x="' + x + '" y="' + officialTopY +
          '" width="' + barWidth + '" height="' + offH + '" rx="2" ' +
          'style="animation-delay:' + delay + 'ms">' +
          "<title>" + y + " — Official: " + off + "</title></rect>"
        );
      }
      if (prep > 0) {
        parts.push(
          '<rect class="bar-segment bar-prep" x="' + x + '" y="' + prepTopY +
          '" width="' + barWidth + '" height="' + prepH + '" rx="2" ' +
          'style="animation-delay:' + delay + 'ms">' +
          "<title>" + y + " — Prep: " + prep + "</title></rect>"
        );
      }
      if (y % 5 === 0) {
        parts.push(
          '<text class="bar-year-label" x="' + (x + barWidth / 2) + '" y="' + (chartHeight + 14) +
          '" text-anchor="middle">' + y + "</text>"
        );
      }
      parts.push("</g>");
    });

    return (
      '<svg class="stats-chart-svg" width="' + chartWidth + '" height="' + (chartHeight + labelSpace) +
      '" viewBox="0 0 ' + chartWidth + " " + (chartHeight + labelSpace) + '">' +
      parts.join("") +
      "</svg>"
    );
  }

  function buildSubsetBreakdownHtml(bySubset) {
    var entries = Object.keys(bySubset).map(function (k) { return [k, bySubset[k]]; });
    if (entries.length === 0) {
      return '<p class="keyword-text">No subset data for the current filters.</p>';
    }
    entries.sort(function (a, b) { return b[1] - a[1]; });
    var max = entries[0][1];

    return entries.map(function (e) {
      var name = e[0];
      var count = e[1];
      var pct = Math.round((count / max) * 100);
      var color = tileColorVar(name);
      return (
        '<div class="subset-bar-row">' +
        '<span class="subset-bar-label"><span class="chip-dot" style="--tile-color:' + color + '"></span>' +
        escapeHtml(name) + "</span>" +
        '<div class="subset-bar-track"><div class="subset-bar-fill" style="width:' + pct + "%; background:" + color + ';"></div></div>' +
        '<span class="subset-bar-count">' + count + "</span>" +
        "</div>"
      );
    }).join("");
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // -----------------------------------------------------------------
  // Open the PDF in a new tab via viewer.html.
  // -----------------------------------------------------------------
  function openPdfInNewTab(btn, kind) {
    var id = btn.getAttribute("data-id");
    var problem = allProblems.find(function (p) {
      return p.id === id;
    });
    if (!problem) return;

    var file = kind === "problem" ? problem.problem_pdf : problem.solution_pdf;
    var page = kind === "problem" ? problem.problem_page : problem.solution_page;
    if (!file) return;

    var src = "viewer.html?file=" + encodeURIComponent(file);
    if (page) src += "#page=" + encodeURIComponent(page);

    window.open(src, "_blank", "noopener");
  }

  // -----------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", loadData);
})();
