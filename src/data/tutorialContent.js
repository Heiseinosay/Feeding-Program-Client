// TEXT OF THE TUTORIAL PAGE (pages/Tutorial.jsx only lays it out)
//
// Edit the wording here; no layout code needs to change.
//   - Put **two stars** around a button, field or page name to show it in bold.
//   - Every button label, field name and message below is copied from the real pages
//     (pages/Students.jsx, pages/FeedingProgram.jsx). When one of them changes there, change it here too.
//   - Videos are set in tutorialVideos.js, not here.

export const TUTORIAL_PAGE = {
    eyebrow: "Teacher Guide",
    title: "How to Use the Feeding Program System",
    intro:
        "This guide shows you the four main tasks, step by step. Each tab has the same parts, so you always know where to look.",
    workflowNote: "New here? Follow the tabs in order.",
    helpText: "Need help? Contact your administrator.",
    // Change this date whenever the text below is edited
    lastUpdated: "October 21, 2026",
};

// STATUS LABELS (glossary of the Record BMI tab)
// Same labels as BMI_STATUS_LABELS / HFA_STATUS_LABELS in pages/Students.jsx, which show the
// statuses produced by server/growth.py. Only the plain-language meanings are written here.
const BMI_STATUS_GLOSSARY = [
    { label: "Severely Wasted", meaning: "Very thin for their age." },
    { label: "Wasted", meaning: "Thin for their age." },
    { label: "Normal", meaning: "A healthy weight for their age." },
    { label: "Overweight", meaning: "Heavier than is healthy for their age." },
    { label: "Obese", meaning: "Much heavier than is healthy for their age." },
];

const HFA_STATUS_GLOSSARY = [
    { label: "Severely Stunted", meaning: "Very short for their age." },
    { label: "Stunted", meaning: "Short for their age." },
    { label: "Normal", meaning: "A usual height for their age." },
    { label: "Tall", meaning: "Taller than most children of their age." },
];

// One entry per tab, in the order they are shown. `summary` is the short line on the card at the top
// of the page. `key` is what appears in the address
// (/tutorial?tab=student) and must match a key in tutorialVideos.js.
export const TUTORIAL_TABS = [
    // ------------------------------------------------------------------ 1. CREATE A SECTION
    {
        key: "section",
        label: "Create a Section",
        workflowLabel: "Create a section",
        summary: "Set up a class group for your students.",
        purpose: "A section is a class group. You need at least one section before you can add students.",
        before: [
            "You are logged in as a teacher.",
            "You know the name of the section and its grade level.",
        ],
        stepGroups: [
            {
                steps: [
                    "Open **Students** from the menu on the left.",
                    "Click the **Create new section** card. It is the first card and has a plus sign.",
                    "The **Add Section** window opens. Type the name in **Section Name**.",
                    "Choose the **Grade Level** from the list.",
                    "Click **Add Section**. To stop without saving, click **Cancel**.",
                ],
            },
        ],
        fields: [
            { field: "Section Name", required: "Yes", format: "Text", example: "Section A" },
            { field: "Grade Level", required: "Yes", format: "Choose from the list: Kinder or Grade 7", example: "Grade 7" },
        ],
        next: [
            "A green message appears: \"Success! Section A has been created successfully!\"",
            "A new card for the section appears. It shows the section name, the grade level, the number of students and the date it was created.",
            "The system gives the section its own ID automatically. You do not type it and you do not need to remember it.",
            "You can now add students to this section.",
        ],
        mistakes: [
            {
                message: "Nothing happens when you click Add Section",
                fix: "**Section Name** or **Grade Level** is empty. Fill in both, then click **Add Section** again.",
            },
            {
                message: "\"A section Section A for Grade 7 already exists.\"",
                fix: "You already have a section with the same name in the same grade level. Use a different name. Capital and small letters count as the same, so \"section a\" and \"Section A\" are one name. The same name is allowed in a different grade level.",
            },
            {
                message: "\"Something went wrong. Try again later!\"",
                fix: "The section was not saved. Try again. If it keeps happening, contact your administrator.",
            },
            {
                message: "\"An error occurred during adding new section. Please check if the section is already exist.\"",
                fix: "Check your internet connection. Look at the section cards to see if the section is already there, then try again.",
            },
        ],
        notes: [
            "To rename a section or change its grade level, click the pencil on its card. The **Edit Section** window opens.",
            "Deleting a section also deletes the students in it. This cannot be undone.",
        ],
    },

    // ------------------------------------------------------------------ 2. ADD A STUDENT
    {
        key: "student",
        label: "Add a Student",
        workflowLabel: "Add students",
        summary: "Enrol each learner with a first height and weight.",
        purpose: "Add each learner who is enrolled in the feeding program, together with their first height and weight.",
        before: [
            "The student's section already exists. If it does not, create it first (see the **Create a Section** tab).",
            "Add only students who are enrolled in the feeding program.",
            "Have the student's birthday, height in centimetres and weight in kilograms ready.",
        ],
        stepGroups: [
            {
                steps: [
                    "Open **Students** from the menu on the left.",
                    "Find the **Add Student** form on the right side of the page. If you do not see it, click the **Add Student** button on the right edge to open it.",
                    "Type the **First Name** and the **Last Name**. **Middle Name** is optional.",
                    "Choose the **Sex**: Male or Female.",
                    "Pick the **Birthday**. The age appears under it by itself, for example \"Age: 10 y 7 m\".",
                    "Choose the **Grade Level**, then the **Section**. The **Section** list only shows the sections of the grade level you chose.",
                    "Type the **Height (cm)** and the **Weight (kg)**.",
                    "Click **Save Student**. To empty the form and start again, click **Clear**.",
                ],
            },
        ],
        fields: [
            { field: "First Name", required: "Yes", format: "Text", example: "Juan" },
            { field: "Middle Name", required: "No", format: "Text", example: "Santos" },
            { field: "Last Name", required: "Yes", format: "Text", example: "Dela Cruz" },
            { field: "Sex", required: "Yes", format: "Choose Male or Female", example: "Male" },
            { field: "Birthday", required: "Yes", format: "A date. It cannot be in the future.", example: "March 10, 2015" },
            { field: "Grade Level", required: "Yes", format: "Choose from the list. It shows only grade levels that have a section.", example: "Grade 7" },
            { field: "Section", required: "Yes", format: "Choose from the list, after the grade level", example: "Section A" },
            { field: "Height (cm)", required: "Yes", format: "A number in centimetres, up to 250. One decimal place is allowed.", example: "135.5" },
            { field: "Weight (kg)", required: "Yes", format: "A number in kilograms, up to 200. One decimal place is allowed.", example: "30.2" },
        ],
        next: [
            "A green message appears: \"Success! Dela Cruz, Juan Santos has been added successfully!\"",
            "The student appears in the table of their section. Click the section card to see its students.",
            "The age is calculated from the birthday. You never type the age. It is shown in years and months, for example \"10 y 7 m\".",
            "The **BMI** and the **BMI Status** are calculated automatically from the height and weight. This is saved as the student's first measurement.",
            "If the numbers look unusual, the message also says \"Please double-check this measurement\". The student is still saved.",
            "The form is emptied, ready for the next student.",
        ],
        mistakes: [
            { message: "\"First name is required\" or \"Last name is required\"", fix: "Type the missing name." },
            { message: "\"Sex is required\"", fix: "Choose Male or Female." },
            { message: "\"Birthday is required\"", fix: "Pick the student's birthday. Statuses cannot be calculated without it." },
            { message: "\"Birthday can't be in the future\"", fix: "Check the year you picked." },
            { message: "\"Grade level is required\" or \"Section is required\"", fix: "Choose the grade level first, then the section." },
            {
                message: "The Section list says \"Select grade first\" or \"No sections available\"",
                fix: "Choose a grade level first. If there is still no section, create one (see the **Create a Section** tab).",
            },
            { message: "\"Valid height is required\" or \"Valid weight is required\"", fix: "The box is empty, zero or not a number. Type a number greater than 0." },
            { message: "\"Height can't be more than 250 cm\"", fix: "Check that you typed the height in centimetres." },
            { message: "\"Weight can't be more than 200 kg\"", fix: "Check that you typed the weight in kilograms." },
        ],
        notes: [
            // TODO(tutorial): the request asked to state a supported age range of 6-16. The pages and the server
            // set no such limit, so it is not written here. What the code does is described instead.
            "Statuses use a child growth standard that covers ages 5 years 1 month to 19 years. A student outside this age can still be added. Their BMI Status then uses the regular BMI ranges, and their Height-for-Age shows \"Not Classified\".",
            "To correct a name, sex or birthday later, click the pencil in the **Actions** column. The **Edit Student** form opens. Grade level, section, height and weight are locked there.",
        ],
    },

    // ------------------------------------------------------------------ 3. RECORD BMI
    {
        key: "bmi",
        label: "Record BMI",
        workflowLabel: "Record BMI",
        summary: "Save a new weight and height. The status is worked out for you.",
        purpose: "Record a student's new weight and height. The system works out the BMI and the status for you.",
        before: [
            "The student has already been added (see the **Add a Student** tab).",
            "The student has a birthday on record. Without it, nothing can be saved for that student.",
            "Measure the weight in kilograms (kg) and the height in centimetres (cm).",
        ],
        // Shown above the interactive walkthrough of this tab (optional, any tab may have one)
        walkthroughNote: "This walkthrough shows how to record or update the BMI of a **whole section at once**. To update one student only, follow \"For one student\" in the steps.",
        stepGroups: [
            {
                title: "For one student",
                steps: [
                    "Open **Students** and click the card of the student's section.",
                    "Click the student's row in the table. The student's record opens.",
                    "Click **Update Measurement** at the bottom of the record.",
                    "The **Update Student Measurement** window opens. Type the new **Weight (kg)** and **Height (cm)**.",
                    "Look under the boxes. The BMI status, the Height-for-Age status and the BMI number appear as you type.",
                    "Click **Save Update**.",
                ],
            },
            {
                title: "For a whole section at once",
                steps: [
                    "Open **Students**. Under **Quick Actions**, click **Update Measurement**.",
                    "The **Update Measurements** window opens. Click the tab of the section at the top.",
                    "For each student, type the new **Weight (kg)** and **Height (cm)**. The boxes start with the last saved numbers.",
                    "Check the **BMI Status** and **Height-for-Age** columns. They change as you type.",
                    "Click **Save Updates**.",
                    "A question appears: \"Save Section A new measurement? This cannot be undone.\" Click **OK** to save.",
                ],
            },
        ],
        fields: [
            { field: "Full Name", required: "Filled in for you", format: "Cannot be changed here", example: "Dela Cruz, Juan Santos" },
            { field: "Weight (kg)", required: "Yes", format: "A number in kilograms, greater than 0 and up to 200. One decimal place is allowed.", example: "30.5" },
            { field: "Height (cm)", required: "Yes", format: "A number in centimetres, greater than 0 and up to 250. One decimal place is allowed.", example: "135.0" },
        ],
        next: [
            "For one student, a green message appears: \"Success! Student measurement updated successfully!\"",
            "For a whole section, the message is: \"Measurements saved for 25 of 25 students.\"",
            "The BMI, the BMI Status and the Height-for-Age status are calculated automatically. You never type them.",
            "Each save is kept as a new record with today's date. Earlier measurements are kept. To see them, click the student's row and look at **BMI Tracking**: it shows the Current BMI, the Previous BMI, the Trend and one bar for each measurement.",
            "When you save a whole section, every student in that section gets a record for today, even the students whose numbers you did not change.",
        ],
        mistakes: [
            {
                message: "\"Please provide valid weight and height values.\"",
                fix: "A box is empty, zero or not a number. Type a number greater than 0 in both boxes.",
            },
            {
                message: "\"This student has no birthday yet.\" or \"Birthday needed\"",
                fix: "Close the window. Click the pencil in the student's **Actions** column, add the **Birthday** and click **Save Changes**. Then record the measurement.",
            },
            {
                message: "\"Nothing can be saved for this section yet. Add the birthday of these students first (Edit Student):\"",
                fix: "The students listed under the message have no birthday. Add each one's birthday first. **Save Updates** works again once none are missing.",
            },
            {
                message: "\"Saved 23 of 25 students.\" followed by \"Not saved:\"",
                fix: "Each student under \"Not saved:\" has a reason next to their name. Correct that student's numbers and save again.",
            },
            {
                message: "\"Please double-check this measurement\" or \"Saved, but please double-check:\"",
                fix: "The numbers were saved but look unusual. Check that weight and height were not swapped, and that you used kilograms and centimetres.",
            },
            {
                message: "\"No sections available\" or \"No students\"",
                fix: "Create a section first, then add students to it (see the first two tabs).",
            },
        ],
        notes: [
            "**To correct a wrong entry:** save the right numbers again for the same student on the same day. They replace the numbers saved earlier that day.",
            "Measurements from earlier days cannot be changed or deleted. If an older one is wrong, record a new correct measurement today.",
        ],
        glossary: {
            title: "What the status labels mean",
            groups: [
                { title: "BMI Status", items: BMI_STATUS_GLOSSARY },
                { title: "Height-for-Age", items: HFA_STATUS_GLOSSARY },
            ],
            footnotes: [
                "**At-Risk** means any BMI Status other than Normal. On the **Students** page, the **At-Risk** button shows only these students.",
                "Students younger than 5 years 1 month or older than 19 years are outside the child growth standard. Their BMI Status can then be Underweight, Normal or Overweight, and their Height-for-Age shows \"Not Classified\".",
            ],
        },
    },

    // ------------------------------------------------------------------ 4. CREATE A SESSION
    {
        key: "session",
        label: "Create a Session",
        workflowLabel: "Create a session",
        summary: "Plan a feeding day, then mark who was present.",
        purpose: "A session is one feeding day. It records the date, the sections that take part, the sponsors, the cost and the foods served. After the feeding, it also records which students were present.",
        before: [
            "At least one section exists. The sections you can choose come from the **Students** page.",
            "Choose a weekday (Monday to Friday) that is today or later, and not a holiday.",
            "Only one session is allowed in each week.",
        ],
        stepGroups: [
            {
                steps: [
                    "Open **Feeding Program** from the menu on the left.",
                    "On the **Feeding Sessions** card, click **Create new**. The **Create Session** form opens on the right.",
                    "Pick the **Date**.",
                    "Under **Participating Sections**, tick every section that will join.",
                    "Type the **Sponsors**, if there are any. This is optional.",
                    "Type the **Total Cost (₱)**. This is optional.",
                    "Under **Foods Served**, type the food name and choose its group: Go, Grow, Glow or Not specified.",
                    "For another food, click **+ Add food** and fill it in the same way.",
                    "Click **Save Session**. To empty the form and start again, click **Clear**.",
                ],
            },
        ],
        fields: [
            { field: "Date", required: "Yes", format: "A weekday (Mon–Fri), today or later, not a holiday. One session per week.", example: "Tuesday, November 10, 2026" },
            { field: "Participating Sections", required: "Yes", format: "Tick one or more sections", example: "Grade 7 - Section A" },
            { field: "Sponsors", required: "No", format: "Text", example: "School MOOE, PTA" },
            { field: "Total Cost (₱)", required: "No", format: "An amount in pesos, with at most 2 decimal places. The most allowed is ₱99,999,999.99.", example: "1500.00" },
            { field: "Foods Served", required: "Yes", format: "At least one food, up to 20. Each name has 2 to 100 characters, and each food needs a group.", example: "Rice (Go), Boiled egg (Grow)" },
        ],
        next: [
            "A green message appears: \"Success! Session created successfully!\"",
            "The session appears in the **Feeding Sessions** list of its month, with its Date, Status, Sections, Sponsors and Foods.",
            "It also appears on the **Feeding Program Calendar** as an \"Event\" on its date.",
            "The **Status** is set automatically: Upcoming before the date, Today on the date, and Pending when the date has passed and the session is not yet marked completed.",
            "After the feeding, open the session with the pencil (**Edit**) or by clicking its Event on the calendar, then click **Mark Completed**.",
            "Then click **Take Attendance**. For each student choose Yes or No under **Present**, add **Remarks** if needed, and click **Save attendance**. Saved attendance cannot be edited later.",
        ],
        mistakes: [
            { message: "\"Please select a date.\"", fix: "Pick a date." },
            { message: "\"Past dates are not allowed.\"", fix: "Choose today or a later date." },
            { message: "\"Only weekdays (Mon–Fri) are allowed.\"", fix: "Choose a date from Monday to Friday." },
            { message: "\"The chosen date is a holiday (...). Please select another date.\"", fix: "Choose a different date. Holidays are marked on the calendar." },
            { message: "\"A session already exists in that week (Mon–Fri). Please choose another week.\"", fix: "That week already has a session. Choose a date in another week, or edit the existing session." },
            { message: "\"Please select at least one section.\"", fix: "Tick at least one section under **Participating Sections**." },
            { message: "\"No sections available\"", fix: "Create a section first on the **Students** page (see the **Create a Section** tab)." },
            { message: "\"Enter a valid amount, e.g. 1500 or 1500.50.\" or \"Use at most 2 decimal places.\"", fix: "Type the cost as a number only, for example 1500 or 1500.50. You may also leave it empty." },
            { message: "\"Enter a food name.\", \"Use 2–100 characters.\" or \"Enter a valid food name.\"", fix: "Type the name of the food in words, with at least 2 characters." },
            { message: "\"Already listed.\"", fix: "The same food is typed twice. Remove one with the X button beside it." },
            { message: "\"Choose Go, Grow, Glow or Not specified.\"", fix: "Choose a group for that food." },
            { message: "\"Session must first be completed before taking attendance.\"", fix: "Open the session and click **Mark Completed** first. Then take attendance." },
        ],
        notes: [],
    },
];
