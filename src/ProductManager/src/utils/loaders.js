export async function loadNavbar() {
  const res = await fetch("src/components/navbar.html");
  document.getElementById("navbar").innerHTML = await res.text();
}
