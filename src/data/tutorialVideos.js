// VIDEOS AND INTERACTIVE WALKTHROUGHS OF THE TUTORIAL PAGE
// This is the only place to edit when a video or a walkthrough is ready: one entry per tab.
// The keys are the same as the tabs in tutorialContent.js: section, student, bmi, session.

// VIDEOS (shown near the top of each tab)
// Leave a value empty ("") to show "Video coming soon".
// Paste an EMBED link (it must start with https://), for example:
//   YouTube:       https://www.youtube.com/embed/VIDEO_ID
//   Google Drive:  https://drive.google.com/file/d/FILE_ID/preview
// (A normal "watch" or "view" link will not play inside the page; use the embed / preview form.)
export const TUTORIAL_VIDEOS = {
    section: "",
    student: "",
    bmi: "",
    session: "",
};

// INTERACTIVE WALKTHROUGHS (shown in place of the video of that tab)
// A click-through demo made with iorad. Leave a value empty ("") to show the video (or "Video coming soon") instead.
//
// How to get the link from iorad's embed code: iorad gives a long block of HTML. Only one part of it
// is needed: find  <iframe src="..."  and copy the address between the quotes. It looks like
//   https://www.iorad.com/player/NUMBER/Some-Title?iframeHash=watchsteps-1&src=iframe&oembed=1
// Paste that address here. Do not paste the HTML block itself into any file.
export const TUTORIAL_WALKTHROUGHS = {
    section: "https://www.iorad.com/player/2780979/Feedingprogram-Netlify---How-to-untitled-task-name?iframeHash=watchsteps-1&src=iframe&oembed=1&coverDisabled=true",
    student: "https://www.iorad.com/player/2780993/Feedingprogram-Netlify---How-to-untitled-task-name?iframeHash=watchsteps-1&src=iframe&oembed=1&coverDisabled=true",
    bmi: "https://www.iorad.com/player/2781008/Feedingprogram-Netlify---How-to-untitled-task-name?iframeHash=watchsteps-1&src=iframe&oembed=1&coverDisabled=true",
    session: "https://www.iorad.com/player/2781022/Feedingprogram-Netlify---How-to-untitled-task-name?iframeHash=watchsteps-1&src=iframe&oembed=1&coverDisabled=true",
};
