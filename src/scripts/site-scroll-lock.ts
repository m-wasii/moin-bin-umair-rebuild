let lockedScrollY = 0;
let scrollLockCount = 0;

export function lockDocumentScroll() {
	if (scrollLockCount === 0) {
		lockedScrollY = window.scrollY;
		document.documentElement.classList.add("video-open");
		document.body.style.position = "fixed";
		document.body.style.top = `-${lockedScrollY}px`;
		document.body.style.left = "0";
		document.body.style.right = "0";
		document.body.style.width = "100%";
	}
	scrollLockCount += 1;
}

export function unlockDocumentScroll() {
	scrollLockCount = Math.max(0, scrollLockCount - 1);
	if (scrollLockCount > 0) return;

	const scrollY = lockedScrollY;
	document.documentElement.classList.remove("video-open");
	document.body.style.position = "";
	document.body.style.top = "";
	document.body.style.left = "";
	document.body.style.right = "";
	document.body.style.width = "";

	const { scrollBehavior } = document.documentElement.style;
	document.documentElement.style.scrollBehavior = "auto";
	window.scrollTo(0, scrollY);
	document.documentElement.style.scrollBehavior = scrollBehavior;
}
