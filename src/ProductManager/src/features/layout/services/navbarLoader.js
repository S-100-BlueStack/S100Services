export async function loadNavbar() {
  const res = await fetch(`${import.meta.env.BASE_URL}components/navbar.html`);
  const html = await res.text();

  document.getElementById("navbar").innerHTML = html;

  const docButton = document.getElementById("documentation-button");
  if (docButton) {
    docButton.addEventListener("click", () => {
      window.open("#", "_blank");
    });
  }
}
