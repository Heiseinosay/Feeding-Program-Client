// PACKAGES
import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

// STYLES
import '../styles/root_variables.css'
import '../styles/TutorialStyle.css'

// CONTENT (all the words and the video links live in these two files, not here)
import { TUTORIAL_PAGE, TUTORIAL_TABS } from '../data/tutorialContent'
import { TUTORIAL_VIDEOS, TUTORIAL_WALKTHROUGHS } from '../data/tutorialVideos'

// Images
import Logo from '../images/logo.png'

// Teacher guide: how to create a section, add a student, record BMI and create a session.
// This page has no sidebar on purpose: a top bar with the logo and a Back button leads to the dashboard.
// Access is checked by <RequireRole role="teacher"> in App.js, like every other teacher page.

const DASHBOARD_PATH = "/dashboard";
const TAB_PARAM = "tab";
const DOCUMENT_TITLE = "Feeding Program | Tutorial";
const GUIDES_ID = "tutorial-guides";

// One icon per guide, shown on its card at the top of the page (same keys as the tabs)
const TAB_ICON_PATHS = {
    section: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    student: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z",
    bmi: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
    session: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
};

// 1 -> "01"
const twoDigits = (number) => String(number).padStart(2, "0");

// "Click **Save**" -> Click <strong>Save</strong>
const RichText = ({ text }) =>
    String(text ?? "")
        .split("**")
        .map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : <React.Fragment key={index}>{part}</React.Fragment>));

// Only embed links are played inside the page
const isPlayableUrl = (url) => /^https:\/\//i.test(String(url ?? "").trim());

// 16:9 video area. Nothing is loaded from the video site until the teacher clicks Play.
const TutorialVideo = ({ url, title }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const source = String(url ?? "").trim();

    // A different tab (or a different link) starts unplayed again
    useEffect(() => {
        setIsPlaying(false);
    }, [source]);

    if (!isPlayableUrl(source)) {
        return (
            <div className="tutorial-video tutorial-video-empty" role="img" aria-label="Video coming soon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <strong>Video coming soon</strong>
                <span>The steps explain everything you need.</span>
            </div>
        );
    }

    if (!isPlaying) {
        return (
            <button type="button" className="tutorial-video tutorial-video-play" onClick={() => setIsPlaying(true)}>
                <span className="tutorial-video-play-icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </span>
                <strong>Play video</strong>
                <span>{title}</span>
            </button>
        );
    }

    return (
        <div className="tutorial-video">
            <iframe
                src={source}
                title={`Video: ${title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
            />
        </div>
    );
};

// Interactive click-through demo (iorad), shown in place of the video on a tab that has one.
// Like the video, nothing is loaded from the other site until the teacher clicks.
const TutorialWalkthrough = ({ url, title }) => {
    const [isOpen, setIsOpen] = useState(false);
    const source = String(url ?? "").trim();

    // A different tab (or a different link) starts closed again
    useEffect(() => {
        setIsOpen(false);
    }, [source]);

    if (!isOpen) {
        return (
            <button type="button" className="tutorial-walkthrough tutorial-walkthrough-start" onClick={() => setIsOpen(true)}>
                <span className="tutorial-video-play-icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </span>
                <strong>Start the interactive walkthrough</strong>
                <span>Click through the steps of "{title}" on a copy of the real screens.</span>
            </button>
        );
    }

    return (
        <div className="tutorial-walkthrough">
            {/* SECURITY: the demo runs in a sandbox. It may run its own scripts and go full screen,
                but it cannot move this page to another address or use the camera or microphone. */}
            <iframe
                src={source}
                title={`Interactive walkthrough: ${title}`}
                allow="clipboard-write"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-forms allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            />
        </div>
    );
};

// One card of a guide, always with the same heading style
const Block = ({ title, children }) => (
    <section className="tutorial-block">
        <h3>{title}</h3>
        {children}
    </section>
);

function Tutorial() {
    const [searchParams, setSearchParams] = useSearchParams();

    // Browser tab title. Set directly: <Helmet> (used by the other pages) does not apply its title
    // on a page that never re-renders after loading, which is the case here.
    useEffect(() => {
        document.title = DOCUMENT_TITLE;
    }, []);

    // The tab comes from the address (/tutorial?tab=student), so a guide can be shared or opened directly.
    // An unknown or missing value shows the first tab.
    const requestedTab = searchParams.get(TAB_PARAM);
    const activeTab = TUTORIAL_TABS.find((tab) => tab.key === requestedTab) || TUTORIAL_TABS[0];
    const activeNumber = TUTORIAL_TABS.indexOf(activeTab) + 1;
    const hasWalkthrough = isPlayableUrl(TUTORIAL_WALKTHROUGHS[activeTab.key]);

    const selectTab = (key) => {
        setSearchParams({ [TAB_PARAM]: key }, { replace: true });
    };

    // A card at the top of the page opens its guide and brings the guide into view
    const openGuide = (key) => {
        selectTab(key);
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(GUIDES_ID)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    };

    // Left / Right arrow keys move between tabs, like any tab list
    const handleTabKeyDown = (event, index) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return;
        }
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = TUTORIAL_TABS[(index + step + TUTORIAL_TABS.length) % TUTORIAL_TABS.length];
        selectTab(next.key);
        document.getElementById(`tutorial-tab-${next.key}`)?.focus();
    };

    return (
        <div className="tutorial-page">
            {/* Top bar (instead of the sidebar): logo and Back, both to the dashboard */}
            <header className="tutorial-topbar">
                <Link to={DASHBOARD_PATH} className="tutorial-brand" aria-label="Feeding Program, go to the dashboard">
                    <img src={Logo} alt="" />
                    <span className="tutorial-brand-text">
                        <strong>Feeding Program</strong>
                        <small>Teacher Portal</small>
                    </span>
                </Link>
                <Link to={DASHBOARD_PATH} className="tutorial-back">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back
                </Link>
            </header>

            {/* Hero: the title and the four tasks in order, one card each */}
            <section className="tutorial-hero">
                <div className="tutorial-hero-inner">
                    <p className="tutorial-eyebrow">{TUTORIAL_PAGE.eyebrow}</p>
                    <h1>{TUTORIAL_PAGE.title}</h1>
                    <p className="tutorial-hero-intro">{TUTORIAL_PAGE.intro}</p>

                    <ol className="tutorial-hero-cards">
                        {TUTORIAL_TABS.map((tab, index) => {
                            const isActive = tab.key === activeTab.key;
                            return (
                                <li key={tab.key}>
                                    <button
                                        type="button"
                                        className={`tutorial-hero-card ${isActive ? "active" : ""}`}
                                        aria-current={isActive ? "true" : undefined}
                                        onClick={() => openGuide(tab.key)}
                                    >
                                        <span className="tutorial-hero-card-top">
                                            <span className="tutorial-hero-card-number">{index + 1}</span>
                                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={TAB_ICON_PATHS[tab.key]} />
                                            </svg>
                                        </span>
                                        <strong>{tab.workflowLabel}</strong>
                                        <span className="tutorial-hero-card-summary">{tab.summary}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>

                    <p className="tutorial-hero-note">{TUTORIAL_PAGE.workflowNote}</p>
                </div>
            </section>

            <main className="tutorial-main">
                {/* Tabs */}
                <div className="tutorial-tabs" id={GUIDES_ID} role="tablist" aria-label="Tutorial guides">
                    {TUTORIAL_TABS.map((tab, index) => {
                        const isActive = tab.key === activeTab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                role="tab"
                                id={`tutorial-tab-${tab.key}`}
                                aria-selected={isActive}
                                aria-controls={`tutorial-panel-${tab.key}`}
                                tabIndex={isActive ? 0 : -1}
                                className={`tutorial-tab ${isActive ? "active" : ""}`}
                                onClick={() => selectTab(tab.key)}
                                onKeyDown={(event) => handleTabKeyDown(event, index)}
                            >
                                <span className="tutorial-tab-number">{twoDigits(index + 1)}</span>
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Only the active tab's guide is shown. Every guide has the same parts, in the same order. */}
                <article
                    className="tutorial-panel"
                    role="tabpanel"
                    id={`tutorial-panel-${activeTab.key}`}
                    aria-labelledby={`tutorial-tab-${activeTab.key}`}
                >
                    {/* Side by side: the walkthrough (or the video) and the steps to follow */}
                    <div className="tutorial-stage">
                        <div className="tutorial-stage-media">
                            {/* A tab with an interactive walkthrough shows it here, in place of the video */}
                            <h3>{hasWalkthrough ? "Try it yourself" : "Video"}</h3>
                            {hasWalkthrough && activeTab.walkthroughNote ? (
                                <p className="tutorial-walkthrough-note"><RichText text={activeTab.walkthroughNote} /></p>
                            ) : null}
                            {hasWalkthrough ? (
                                <TutorialWalkthrough url={TUTORIAL_WALKTHROUGHS[activeTab.key]} title={activeTab.label} />
                            ) : (
                                <TutorialVideo url={TUTORIAL_VIDEOS[activeTab.key]} title={activeTab.label} />
                            )}
                        </div>

                        <div className="tutorial-stage-side">
                            {/* The steps scroll inside this panel when they are longer than the walkthrough */}
                            <div className="tutorial-stage-side-scroll" role="region" aria-label={`${activeTab.label}: steps`} tabIndex={0}>
                                <p className="tutorial-eyebrow">Guide {twoDigits(activeNumber)} / {twoDigits(TUTORIAL_TABS.length)}</p>
                                <h2>{activeTab.label}</h2>
                                <p className="tutorial-purpose"><RichText text={activeTab.purpose} /></p>

                                <h3>Step-by-step</h3>
                                {activeTab.stepGroups.map((group, groupIndex) => (
                                    <div className="tutorial-steps-group" key={group.title || groupIndex}>
                                        {group.title ? <h4>{group.title}</h4> : null}
                                        <ol className="tutorial-steps">
                                            {group.steps.map((step) => (
                                                <li key={step}><RichText text={step} /></li>
                                            ))}
                                        </ol>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <Block title="Before you start">
                        <ul className="tutorial-list">
                            {activeTab.before.map((item) => (
                                <li key={item}><RichText text={item} /></li>
                            ))}
                        </ul>
                    </Block>

                    <Block title="Field guide">
                        <div className="tutorial-table-wrapper">
                            <table className="tutorial-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Field</th>
                                        <th scope="col">Required?</th>
                                        <th scope="col">Format</th>
                                        <th scope="col">Example</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeTab.fields.map((row) => (
                                        <tr key={row.field}>
                                            <th scope="row" data-label="Field">{row.field}</th>
                                            <td data-label="Required">{row.required}</td>
                                            <td data-label="Format">{row.format}</td>
                                            <td data-label="Example">{row.example}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Block>

                    <Block title="What happens next">
                        <ul className="tutorial-list">
                            {activeTab.next.map((item) => (
                                <li key={item}><RichText text={item} /></li>
                            ))}
                        </ul>
                        {activeTab.notes?.length ? (
                            <div className="tutorial-note" role="note">
                                <strong>Good to know</strong>
                                <ul>
                                    {activeTab.notes.map((item) => (
                                        <li key={item}><RichText text={item} /></li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </Block>

                    {/* Plain-language meaning of the statuses (Record BMI tab only) */}
                    {activeTab.glossary ? (
                        <Block title={activeTab.glossary.title}>
                            <div className="tutorial-glossary">
                                {activeTab.glossary.groups.map((group) => (
                                    <div key={group.title}>
                                        <h4>{group.title}</h4>
                                        <dl>
                                            {group.items.map((item) => (
                                                <div key={item.label}>
                                                    <dt>{item.label}</dt>
                                                    <dd>{item.meaning}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                ))}
                            </div>
                            <ul className="tutorial-list">
                                {activeTab.glossary.footnotes.map((item) => (
                                    <li key={item}><RichText text={item} /></li>
                                ))}
                            </ul>
                        </Block>
                    ) : null}

                    <Block title="Common mistakes">
                        <dl className="tutorial-mistakes">
                            {activeTab.mistakes.map((item) => (
                                <div key={item.message}>
                                    <dt>{item.message}</dt>
                                    <dd><RichText text={item.fix} /></dd>
                                </div>
                            ))}
                        </dl>
                    </Block>
                </article>
            </main>

            <footer className="tutorial-footer">
                <span>{TUTORIAL_PAGE.helpText}</span>
                <span>Last updated: {TUTORIAL_PAGE.lastUpdated}</span>
            </footer>
        </div>
    )
}

export default Tutorial
