document.getElementById("clipboard").addEventListener("click", function () {
  console.log("hi");
  const textToCopy = document.getElementById("textToCopy");
  textToCopy.select();
  textToCopy.setSelectionRange(0, 99999); // For mobile devices
  try {
    document.execCommand("copy");
    alert("Copied to clipboard!");
  } catch (err) {
    alert("Unable to copy to clipboard.");
  }
});
