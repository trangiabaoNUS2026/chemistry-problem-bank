// ---------------------------------------------------------------------
// Chemistry Olympiad Problem Catalog — app.js
// ---------------------------------------------------------------------

(function () {
  "use strict";

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------
  var allProblems = [];
  var taxonomy = { olympiads: [], subsets: [], types: [] };
  var currentView = localStorage.getItem("catalog-view") || "table";
  var currentTheme = localStorage.getItem("catalog-theme") || "professional";

  var multiSelectState = {
    subset: new Set(),
    theme: new Set(),
    skills: new Set(),
    target_molecules: new Set()
  };

  // -----------------------------------------------------------------
  // DOM refs
  // -----------------------------------------------------------------
  var el = {
    tbody: document.getElementById("problems-tbody"),
    boardGrid: document.getElementById("board-grid"),
    resultsCount: document.getElementById("results-count"),
    emptyState: document.getElementById("empty-state"),
    viewTable: document.getElementById("view-table"),
    viewBoard: document.getElementById("view-board"),
    viewToggle: document.getElementById("view-toggle"),
    themeToggle: document.getElementById("theme-toggle"),
    clearBtn: document.getElementById("clear-filters-btn"),

    filterId: document.getElementById("filter-id"),
    filterTitle: document.getElementById("filter-title"),
    filterNation: document.getElementById("filter-nation"),
    filterOlympiad: document.getElementById("filter-olympiad"),
    filterYear: document.getElementById("filter-year"),
    filterType: document.getElementById("filter-type")
  };

  var multiSelectConfig = [
    { key: "subset", containerId: "multi-subset", label: "subsets" },
    { key: "theme", containerId: "multi-theme", label: "themes" },
    { key: "skills", containerId: "multi-skills", label: "skills" },
    { key: "target_molecules", containerId: "multi-target_molecules", label: "molecules" }
  ];

  // -----------------------------------------------------------------
  // Color system & Badge Builder (Full subset name display, no symbols)
  // -----------------------------------------------------------------
  var TILE_COLOR_COUNT = 10;

  function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function tileColorVar(subsetName) {
    var index = hashString(subsetName) % TILE_COLOR_COUNT;
    return "var(--tile-" + index + ")";
  }

  function buildTileHtml(subsetName) {
    var color = tileColorVar(subsetName);
    var title = escapeHtml(subsetName);
    return (
      '<span class="subset-tag" style="--tile-color:' + color + '" title="' + title + '">' +
      title +
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

        applyTheme(currentTheme);
        populateStaticFilterOptions();
        populateDynamicFilterOptions();
        populateMultiSelects();
        attachFilterListeners();
        attachViewToggleListeners();
        attachThemeToggleListeners();
        applyView(currentView);
        renderResults(allProblems);
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
    el.emptyState.hidden = false;
    el.emptyState.textContent =
      "Could not load the problem catalog data. Please try refreshing the page.";
    el.resultsCount.textContent = "0 results";
  }

  // -----------------------------------------------------------------
  // Theme Toggle
  // -----------------------------------------------------------------
  function attachThemeToggleListeners() {
    el.themeToggle.querySelectorAll(".theme-toggle-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.getAttribute("data-theme"));
      });
    });
  }

  function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem("catalog-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);

    el.themeToggle.querySelectorAll(".theme-toggle-btn").forEach(function (btn) {
      var isActive = btn.getAttribute("data-theme") === theme;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  // -----------------------------------------------------------------
  // View toggle (Table / Board)
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

    if (view === "board") {
      el.viewTable.hidden = true;
      el.viewBoard.hidden = false;
    } else {
      el.viewTable.hidden = false;
      el.viewBoard.hidden = true;
    }
  }

  // -----------------------------------------------------------------
  // Filter option population
  // -----------------------------------------------------------------
  function populateStaticFilterOptions() {
    fillSelect(el.filterOlympiad, taxonomy.olympiads || []);
    fillSelect(el.filterType, taxonomy.types || []);
  }

  function populateDynamicFilterOptions() {
    var nations = distinctValues(allProblems, "nation");
    var years = distinctValues(allProblems, "year").sort(function (a, b) {
      return a - b;
    });
    fillSelect(el.filterNation, nations);
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
  // Multi-select popovers
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
    [el.filterId, el.filterTitle].forEach(function (input) {
      input.addEventListener("input", applyFilters);
    });
    [el.filterNation, el.filterOlympiad, el.filterYear, el.filterType].forEach(function (sel) {
      sel.addEventListener("change", applyFilters);
    });
    el.clearBtn.addEventListener("click", clearAllFilters);
  }

  function clearAllFilters() {
    el.filterId.value = "";
    el.filterTitle.value = "";
    el.filterNation.value = "";
    el.filterOlympiad.value = "";
    el.filterYear.value = "";
    el.filterType.value = "";

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

  function problemMatchesFilters(problem, filters) {
    if (filters.id && !String(problem.id || "").toLowerCase().includes(filters.id)) {
      return false;
    }
    if (filters.title && !String(problem.title || "").toLowerCase().includes(filters.title)) {
      return false;
    }

    if (filters.nation && String(problem.nation) !== filters.nation) return false;
    if (filters.olympiad && String(problem.olympiad) !== filters.olympiad) return false;
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
      nation: el.filterNation.value,
      olympiad: el.filterOlympiad.value,
      year: el.filterYear.value,
      type: el.filterType.value
    };
  }

  function applyFilters() {
    var filters = getActiveFilters();
    var filtered = allProblems.filter(function (p) {
      return problemMatchesFilters(p, filters);
    });
    renderResults(filtered);
  }

  // -----------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------
  function renderResults(problems) {
    el.resultsCount.textContent = problems.length + " results";

    if (problems.length === 0) {
      el.tbody.innerHTML = "";
      el.boardGrid.innerHTML = "";
      el.viewTable.hidden = true;
      el.viewBoard.hidden = true;
      el.emptyState.hidden = false;
      el.emptyState.textContent = "No problems match these filters.";
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
    var subsetTiles = (problem.subset || []).map(buildTileHtml).join("");
    var themeText = Array.isArray(problem.theme) ? problem.theme.join(", ") : (problem.theme || "");

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
      '<td class="cell-year" data-label="Year">' + escapeHtml(problem.year) + "</td>" +
      '<td data-label="Subset"><span class="chip-row">' + subsetTiles + "</span></td>" +
      '<td class="cell-theme" data-label="Theme">' + escapeHtml(themeText) + "</td>" +
      '<td data-label="Type">' + escapeHtml(problem.type) + "</td>" +
      '<td class="actions-cell" data-label="Actions">' + problemBtn + solutionBtn + "</td>" +
      "</tr>"
    );
  }

  function buildCardHtml(problem) {
    var primarySubset = (problem.subset && problem.subset[0]) || null;
    var accentColor = primarySubset ? tileColorVar(primarySubset) : "var(--accent)";
    var subsetTiles = (problem.subset || []).map(buildTileHtml).join("");

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
      '<span class="card-id">' + escapeHtml(problem.id) + "</span>" +
      '<span class="card-year">' + escapeHtml(problem.year) + "</span>" +
      "</div>" +
      '<h3 class="card-title">' + escapeHtml(problem.title) + "</h3>" +
      '<div class="card-meta">' +
      '<span>' + escapeHtml(problem.olympiad) + "</span>" +
      '<span class="dot">' + escapeHtml(problem.nation) + "</span>" +
      '<span class="dot">' + escapeHtml(problem.type) + "</span>" +
      "</div>" +
      '<span class="chip-row">' + subsetTiles + "</span>" +
      '<div class="card-actions">' + problemBtn + solutionBtn + "</div>" +
      "</article>"
    );
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

  document.addEventListener("DOMContentLoaded", loadData);
})();
