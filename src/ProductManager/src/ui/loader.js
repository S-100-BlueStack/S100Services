let loaderElement;
let loaderTextElement;
let isInitialized = false;

function initLoader() {
  if (isInitialized) return;

  loaderElement = document.getElementById("app-loader");
  loaderTextElement = document.getElementById("loader-text");

  isInitialized = true;
}

export function showLoader(text = "Loading...") {
  initLoader();

  if (!loaderElement) return;

  setLoaderText(text);

  requestAnimationFrame(() => {
    loaderElement.classList.remove("hidden");
  });
}

export function hideLoader() {
  if (!loaderElement) return;
  loaderElement.classList.add("hidden");
}

export function setLoaderText(text) {
  if (!loaderTextElement) return;
  loaderTextElement.textContent = text;
  loaderTextElement.style.visibility = "visible";
}
