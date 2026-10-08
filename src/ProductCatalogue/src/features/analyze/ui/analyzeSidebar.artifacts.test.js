import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fetchAnalyzeProducts } from "../api/analyzeApi.js";
import {
  artifactHarness,
  memberNames,
  validationArtifact,
} from "../api/analyzeArtifactTestSupport.js";

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.classList = {
      add: (value) => {
        this.className += ` ${value}`;
      },
    };
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
  querySelector(selector) {
    return this.find((node) => node.className.split(" ").includes(selector.slice(1)));
  }
  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    return null;
  }
  collect(predicate) {
    return this.children.flatMap((child) => [
      ...(predicate(child) ? [child] : []),
      ...child.collect(predicate),
    ]);
  }
  setAttribute() {}
}

for (const emptyLegacy of [false, true]) {
  test(`package member presentation uses only its own report links (empty legacy: ${emptyLegacy})`, async (t) => {
    const response = {
      Data: emptyLegacy ? [validationArtifact(0)] : [validationArtifact(0), validationArtifact(1)],
    };
    const [product] = await fetchAnalyzeProducts(memberNames, artifactHarness({ response }));
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: (tag) => new Element(tag) };
    t.after(() => {
      globalThis.document = previousDocument;
    });
    const moduleUrl = new URL("./analyzeSidebar.js", import.meta.url);
    const source = (await readFile(moduleUrl, "utf8"))
      .replace(
        /import \{\s*createProductHistoryEventList,[\s\S]*?from "[^"]*productHistoryRenderers.js";/,
        'const createProductHistoryEventList = () => document.createElement("div"); const createProductHistorySummary = () => document.createElement("div"); const createProductHistoryStateMessage = () => document.createElement("div");'
      )
      .replace(
        /from "(\.[^"]+)"/g,
        (_, path) => `from ${JSON.stringify(new URL(path, moduleUrl).href)}`
      );
    // Expose the production card boundary only inside this test module. The
    // unrelated History widget is stubbed; artifact rendering remains production code.
    const { createProductCard } = await import(
      `data:text/javascript;base64,${Buffer.from(source + "\nexport { createProductCard };\n").toString("base64")}`
    );
    const card = createProductCard(product);
    const sections = card.collect((node) =>
      node.className.split(" ").includes("analyze-package-member")
    );
    assert.equal(sections.length, 2);
    for (const [index, section] of sections.entries()) {
      const links = section.collect((node) => node.tagName === "a");
      assert.deepEqual(
        links.map((link) => link.href),
        product.members[index].internalValidationReports.map((report) => report.url)
      );
      assert.equal(links.length, emptyLegacy && index === 1 ? 0 : 1);
      assert.equal(
        section.querySelector(".analyze-product-card__title").textContent,
        `${product.members[index].memberLabel} · ${memberNames[index]}`
      );
      if (emptyLegacy && index === 1) {
        assert.equal(
          section.querySelector(".analyze-internal-validation__state-title").textContent,
          "Internal validation not available"
        );
      }
    }
  });
}
