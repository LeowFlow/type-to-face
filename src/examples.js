const galleryItems = Array.from(document.querySelectorAll(".galleryMedia"));
const modal = document.getElementById("galleryModal");
const modalImage = document.getElementById("galleryModalImage");
const modalDownload = document.getElementById("galleryModalDownload");
const modalClose = document.getElementById("galleryModalClose");

let lastFocusedItem = null;

function getPreviewTitle(index) {
  return `Example ${String(index + 1).padStart(2, "0")}`;
}

function getFilename(src) {
  return src.split("/").pop() || "type-to-face-export.png";
}

function openPreview(item, index) {
  const image = item.querySelector("img");

  if (!image) {
    return;
  }

  const title = getPreviewTitle(index);
  const src = image.currentSrc || image.src;

  lastFocusedItem = item;
  modalImage.src = src;
  modalImage.alt = image.alt;
  modalDownload.href = src;
  modalDownload.download = getFilename(src);
  modalDownload.setAttribute("aria-label", `Download ${title} PNG`);
  modalDownload.setAttribute("title", `Download ${title} PNG`);

  document.body.classList.add("modalOpen");
  modal.showModal();
  modalClose.focus();
}

function closePreview() {
  if (modal.open) {
    modal.close();
  }
}

function resetPreview() {
  document.body.classList.remove("modalOpen");
  modalImage.removeAttribute("src");
  modalImage.alt = "";
  modalDownload.removeAttribute("href");
  modalDownload.removeAttribute("download");
  modalDownload.setAttribute("aria-label", "Download PNG");
  modalDownload.setAttribute("title", "Download PNG");

  if (lastFocusedItem) {
    lastFocusedItem.focus();
    lastFocusedItem = null;
  }
}

galleryItems.forEach((item, index) => {
  const title = getPreviewTitle(index);

  item.setAttribute("role", "button");
  item.setAttribute("tabindex", "0");
  item.setAttribute("aria-label", `Open ${title} preview`);

  item.addEventListener("click", () => {
    openPreview(item, index);
  });

  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPreview(item, index);
    }
  });
});

modalClose.addEventListener("click", closePreview);

modal.addEventListener("click", (event) => {
  const rect = modal.getBoundingClientRect();
  const clickedInside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;

  if (!clickedInside) {
    closePreview();
  }
});

modal.addEventListener("close", resetPreview);
