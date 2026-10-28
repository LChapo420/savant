# Camera and microphone for under-13 learners: privacy research and recommendation

Written 2026-10-22. Research only, no code changed. **This is not legal advice. Have a lawyer who does
children's privacy (COPPA, state law, UK/EU) confirm it before launch.** I am an AI; I read primary text where
I could reach it and say below where I could not.

Scope: Savant's basketball (camera) and piano (microphone) tools, processed on the device only; video and
audio are never uploaded; only derived results ("shot made", "notes played") may be stored. US first, then a
short UK/EU note.

---

## 1. Recommendation (read this first)

The owner's three options, in order of preference:

| Option | Legal? | Verdict |
| --- | --- | --- |
| 1. On-device, no parental toggle, no parent-specific step | **Probably defensible under COPPA's "collection" test, but not safe enough to rely on alone.** | Do not stop here. |
| 2. Covered inside the parental consent collected at sign-up | **Yes, if the consent notice describes camera/mic use specifically and the data flows in section 6 hold.** | **Recommended.** |
| 3. Separate parent toggle | Legal but not required by any law I found. | Not needed. Keep a cheap, optional "camera and mic off" setting instead (section 7). |

**Recommend Option 2.** Reasons, shortest first:

1. Under-13 learners need verifiable parental consent for their account anyway (they have a name, an email or
   login, a persistent ID, learning history). One more clearly worded paragraph in that same consent costs
   nothing and removes the argument about whether camera/mic needed its own consent.
2. COPPA's own text and the FTC's FAQ support "pure on-device processing is not collection" (F.5), but that
   is an FAQ about a photo editor, not a ruling about camera or microphone analysis, and the FTC has not
   addressed ML on a child's camera feed directly. Relying on it alone leaves one regulator reading between you
   and a fine. Telling parents costs little; being wrong costs a lot.
3. The UK Children's Code, GDPR transparency rules, and several US state children's laws expect plain-language
   notice to the child and parent about camera/mic use whether or not data leaves the device.
4. The thing that actually keeps Savant compliant is the data flow, not the toggle. A toggle on top of a flow
   that uploads would not save you, and a clean flow does not need a toggle.

**The bigger finding, which comes before any of this: Savant today has no age gate and no parental consent
step** (section 5). Until there is one, nobody is identified as under 13, and the sign-up consent that Options
1 and 2 depend on does not exist in code. The in-tool line "If you are under 13, ask a parent before using the
camera" is a courtesy note, not verifiable parental consent.

---

## 2. Does on-device processing count as "collecting" under COPPA?

### What the rule says

- 16 CFR 312.2, "personal information" includes "a photograph, video, or audio file where such file contains a
  child's image or voice" and (added by the 2025 amendments) a "biometric identifier that can be used for the
  automated or semi-automated recognition of an individual", with examples such as fingerprints, voiceprints,
  gait patterns, facial templates and faceprints.
- "Collects or collection" is "the gathering of any personal information from a child by any means", including
  asking a child to submit it, enabling public posting, and passive tracking.
- The rule covers an operator that collects PI itself, or on whose behalf it is collected or maintained.

### What the FTC says about data that stays on the device

- **FTC COPPA FAQ F.5**: a kids' photo-editing app that works on photos stored on the device is not collecting
  personal information, as long as nothing is transmitted off the device. This is the closest official
  statement and it matches Savant's design (frames read and dropped on the device).
- The 2025 amendments (published 22 Apr 2025, in force 23 Jun 2025, **compliance deadline 22 Apr 2026, now
  passed**) did not, in the parts I could read, add a rule about on-device processing. I could not read the
  whole 600k-character Federal Register notice, so I cannot say there is no passage on it.
- The FTC dropped its proposed "data derived from voice, gait or facial data" language from the final biometric
  definition, to avoid burdening beneficial uses. That helps: derived scores are not biometric identifiers.

**Reading:** if no image, video or audio of the child (and no template made from it) ever reaches Savant's
servers or a third party, the better reading is that Savant does not "collect" it. Caveats:

- It is an FAQ and an interpretation, not a court holding on camera/mic ML.
- It stops being true the moment frames, clips, audio, face or voice templates, or crash/analytics payloads
  containing them are transmitted, even once, even to debug.
- "Maintained on behalf of" could reach data held by a vendor SDK you ship. Self-host every model.

### The audio-file exception (312.5(c)(9) and FAQ F.6): relevant, but only as a backstop

- Exception: an operator may collect an audio file of a child's voice **with no other personal information**,
  to respond to the child's specific request, use it only for that, not disclose it, and delete it
  **immediately** after responding. No verifiable parental consent is needed, but the privacy policy
  (312.4(d)) must still describe it.
- It was written for things like voice search ("replace typing with speaking"). Piano note detection is not a
  request the child makes in words, and the exception requires collection (transmission to you). Since Savant's
  design never collects the audio, the exception is **not needed on the main path**.
- Use it only if Savant ever sends a short audio clip to a server to grade (for example, a cloud model judging
  a played phrase): then it must be a one-time request, the server must delete the file immediately after
  responding, nothing else is stored with it, no disclosure, and the policy must say so. Other personal
  information (a name, an account ID stored with it) breaks the exception. A stored recording for later review
  is outside it.
- It does not cover video, and does not cover basketball.

### Do derived results count as personal information?

- "Shot made 7 of 10", "C-E-G played correctly", reaction times in a drill, and note events (MIDI number and
  time) are not a photo, video, audio file, voiceprint, faceprint or gait pattern. They are ordinary learning
  data, in the same class as quiz scores.
- They are still PI once linked to an account (a persistent identifier plus information about the child). So
  they fall under the normal rules: covered by the sign-up consent, listed in the privacy policy, kept only as
  long as needed (new written retention policy), secured (new written security program), not disclosed to third
  parties for purposes beyond running the service.
- A raw pose-landmark stream or an audio-feature vector kept per child is the risky grey zone: if it could
  recognise a person (gait, voice) it could be a biometric identifier. Do not store landmarks, spectrograms or
  embeddings. Store outcomes only.

### What notice and consent each case needs (COPPA)

| Case | Consent | Notice |
| --- | --- | --- |
| Frames/audio read on device, dropped; only outcomes stored | Normal verifiable parental consent for the account and its learning data. No separate camera/mic consent is required by COPPA text. | Privacy policy and direct notice to the parent should still say what the camera/mic do and that nothing leaves the device (recommended, see Option 2). |
| Same, plus outcomes sent to a third party AI (for example the modelflare.dev reseller) | If the third party only runs Savant's service (integral), no separate disclosure consent, but the notice must name the practice and Savant must make sure the vendor keeps it confidential and secure (312.8). If used for AI training or ads: separate, express parental consent for disclosure (2025 rule). | Name the provider or category in the policy. |
| Upload of a photo/video/audio for AI critique (a flow already in docs/PRODUCT-DECISIONS.md "Judging skills that are not quizzes") | **This is collection.** Verifiable parental consent before the first upload. "Email plus" is acceptable only if nothing is disclosed to third parties, so not if the critique goes through an outside model. | Direct notice naming what is uploaded, why, retention, deletion. Prefer: disabled for under 13 until a lawyer approves. |
| Short audio sent to a server to grade then deleted | Possibly the (c)(9) exception (strict conditions above). | Policy text required. |
| Any use of the image/voice to identify or recognise the child (login by face/voice, speaker ID, emotion/engagement inference) | Treat as a biometric identifier: verifiable parental consent plus the rest of the rule. | Do not build this for under-13s. |

Consent methods (312.5(b), amended 2025), parent-facing: signed form, card transaction notice, toll-free line,
government ID check, knowledge-based questions, or a selfie matched to a parent's ID (ID and selfie deleted
promptly), and "email plus" (now also text-plus) **only when data is used internally and not disclosed**.

Always required (amended rule): direct notice to the parent before collecting, online privacy policy covering
what is collected and how used/disclosed, a **written data retention policy** (purpose, need, deletion
timeframe, also in the policy), and a **written information security program**. Parents can review and
delete their child's data, and can consent to collection without consenting to third-party disclosure.

### School-managed accounts

FTC FAQ N.1-N.5: a school can consent for parents when Savant collects data only for the school's use and
benefit and **no other commercial purpose**. If Savant uses a school-managed child's data for its own
commercial purposes (such as building its own product models, ads), parental consent is still needed. The
school needs to be able to review and delete the data. Operators stay responsible for COPPA, so terms must not
shift that to the school. Camera/mic needs no extra school step if flows below hold, but name it in the school
agreement.

---

## 3. Do biometric laws apply? (BIPA, Texas, Washington, Colorado)

- **What counts**: Illinois BIPA covers retina/iris scans, fingerprints, voiceprints, and scans of hand or face
  geometry (photographs excluded). Texas (CUBI) and Washington list the same kinds. Colorado's privacy-act
  amendments (HB 24-1130, in effect 2025) widen biometric rules and add heightened minors' rules (SB 24-041,
  effective 1 Oct 2025; details of the final minors rules I did not confirm).
- **Pose landmarks** (body joints: feet, wrists, shoulders) are not listed identifiers: they are not face
  geometry, a voiceprint or a fingerprint, and Savant does not use them to identify anyone. Plain pitch
  detection is not a voiceprint. Risk is low **as long as nothing is built to recognise a person**.
  Face-mesh landmarks (468-point face) would be a different story: avoid them; the basketball plan names Pose
  (body) only.
- **On-device case law (the part that matters most)**: Illinois courts dismissed BIPA claims where the
  developer never received the data: *Barnett v. Apple* (Ill. App. Ct. 2022; secondary sources read, I did not
  read the opinion), *Bhavilai v. Microsoft* (N.D. Ill. 2024), and, per a Mayer Brown summary dated 20 Aug 2026,
  *G.T. v. Samsung* (7th Cir.), which held that "possess", "collect", "capture" and "obtain" need some
  control over the data, and that supplying a tool is not the same as controlling what it generates. Caveats:
  *Hazlitt v. Apple* (S.D. Ill. 2021) went the other way where the vendor alone could access the data; the
  7th Circuit binds federal courts only; defences weaken if data is sent to servers or the vendor keeps access.
  This matches the design rule: **no access, no upload, no remote switch that turns on collection.**
- Practical effect: the on-device design is the main BIPA protection. If you did add a face or voice
  identifier, BIPA's written-release and retention-policy rules would apply and statutory damages are per
  violation.

---

## 4. Other US state laws

- **California AADC (Age-Appropriate Design Code Act)**: applies to services "likely to be accessed by
  children" (under 18). Status per a Cooley note on the 9th Circuit's 12 Mar 2026 decision in *NetChoice v.
  Bonta*: age estimation with reasonable certainty (or child-level protection for everyone), high-privacy
  default settings, and age-appropriate disclosures are **enforceable now**; the DPIA requirement, several
  data-use restrictions ("best interests of children"), and the dark-patterns clause remain enjoined. It is
  still moving, so check status before launch. Practical meaning: default camera and mic to off until the
  user actively turns them on, say what they do in language a child can read, and do not nudge a child to
  weaken settings.
- **CCPA/CPRA**: under 16 needs opt-in before any sale or sharing (under 13: parent). Savant never sells.
  Biometric info processed to identify a person is "sensitive"; Savant does not do this.
- **New York Child Data Protection Act** (under 18, in force June 2025 as I recall; I could only find bill
  drafts, not the enacted text): requires a legal basis such as "strictly necessary" for the service or informed
  consent. On-device camera/mic for the feature the child opened, outcomes stored for their own progress, is
  the shape that fits "strictly necessary". Unverified.
- **Colorado, Connecticut and other state privacy laws**: under-13 data is handled with COPPA-style parental
  consent; teens get extra duties (no targeted ads, impact assessments). Same data flows satisfy them.
- **App stores (for the later native apps)**: Apple's and Google's kids/family policies restrict third-party
  analytics and ad SDKs in kids' apps and require permission-prompt text. Not researched here.

---

## 5. How Savant handles sign-up and consent today (code read, nothing edited)

| What | Finding |
| --- | --- |
| `routes/auth.js` `POST /register` | Takes email, password, display name. **No date of birth, age, parent email, or consent flag.** Creates the user and logs them in. |
| `public-v2/register.html` | Fields: Name, Email, Password. No age question, no consent text, no privacy or terms link. |
| `public-v2/onboarding.html` / `onboarding.js` | Subject and level picker. No age or consent step. |
| Searches for consent / coppa / guardian / dob / under 13 in the auth route, onboarding files and `db/`, `server.js` | No matches. |
| `docs/PRODUCT-DECISIONS.md` | Says "Under 13: parent/guardian-linked or school-managed accounts" (a decision, not yet built). Open risks: deletion must be on before investors (COPPA, GDPR, California); keep under-13 testers out of the beta, or get parent consent that names the modelflare.dev provider. |
| `docs/ROADMAP.md` (line 190, 316) | "COPPA-safe under-13 gate", "Under-13 gate, COPPA/FERPA posture before any school channel, export and delete from Phase 4": planned, not built. |
| `curriculum-build/SKILL-APPS-MECHANICS.md` item 6 | Owner question: "Process on the device only, never upload, and require a parent toggle?" That is the question this document answers. |
| Camera/mic code | `engine/basketball/camera-blocks.js`: getUserMedia video, frames drawn at 320 px, read and dropped; header comment and notice say nothing is uploaded or saved. No `fetch`, upload, or MediaRecorder in this file. `engine/piano/piano-io.js` mic: AudioContext + pitch detection, no fetch or MediaRecorder. |
| Basketball_Film block | Uses `MediaRecorder` in the page to record a short clip and plays it back via a blob URL. Local only (the on-screen note says so). **Check** that no later code posts the blob anywhere and that no "AI critique upload" is wired to it for under-13s. |
| Stored results | Piano song path posts note events `{midi, source}` and play mode results to `/api/piano/songs/:id/result`; checks post answers via `Kit.submit`. Derived outcomes, not audio. Matches the "only derived results stored" design. |
| Existing in-product wording | "If you are under 13, ask a parent before using the camera, and never film other people without asking them." Courtesy note only; replace per section 7. |

So the situation is: **the code already keeps raw camera and microphone data on the device, but there is no
mechanism to learn a user is under 13 or to get verifiable parental consent.** The compliance gap is the
age/consent step, not the camera.

---

## 6. Data flows to keep it compliant (the contract engineering must hold)

Must never happen for any user under 13 (and ideally never for anyone):

1. No upload of video frames, images, thumbnails, clips, audio buffers, spectrograms or recordings, by fetch,
   XHR, beacon, WebSocket, WebRTC, form post or file upload.
2. No cloud speech, vision or pose API. All models (pose, pitch, ball finder) self-hosted as static files; the
   browser downloads them, nothing is sent back.
3. No third-party SDK on pages that open the camera or mic: no analytics, session replay (which can capture
   canvases and video), A/B tools, chat widgets, error reporters that attach screenshots or breadcrumbs with
   media, ads.
4. No face or voice identification, face mesh, gait or voiceprint features, no speaker identification, no
   emotion or engagement inference from face/voice (also a flagged practice in the EU AI Act for education).
5. No raw landmark streams, feature vectors or embeddings stored per child. Not in the database, logs, local
   storage synced to the server, or in prompts.
6. No recording that outlives the session even locally: stop tracks on exit; release the blob URL after
   playback (the Film block should revoke it).
7. No remote switch that can turn on upload later (a server flag, a feature-flag service, a hot-patched
   script). Ship upload code nowhere near the camera/mic modules; an auditor must be able to confirm in an hour
   that there is none.

Allowed to store (outcomes only), tied to the child's account:

- shot made/missed, zone, attempt counts, drill hits/misses/reaction times, score;
- note events (pitch number, timing, correct/incorrect), stars, accuracy;
- "camera used" and "mic used" booleans (for settings and support), no frame or audio content.

Rules for that stored data:

- Used only to run the product and tailor lessons (internal operations). Never sold or shared for ads. No
  training of outside AI models (separate consent needed under the 2025 rule, and the owner already says never
  sell minors' data).
- **Do not put a child's name, email, account ID or raw results in prompts sent to modelflare.dev** or any
  other outside AI during beta without parent consent that names it (the owner's own open risk). If AI coaching
  uses results, send de-identified numbers only, or keep under-13 out.
- Written retention policy: keep outcomes only as long as the learner's account exists and the learning purpose
  needs them; delete on parent request. Deletion must be live before launch (already on the owner's list).
- Written security program for the account data (the new rule). Encrypt in transit and at rest where possible.

Enforcement hooks to add (so the contract survives future code):

- A Content-Security-Policy `connect-src` on camera/mic pages limited to the app's own API for outcome posts,
  and no third-party origins. This is a technical backstop to point 1 and 3.
- A test that fails the build if camera/mic modules reference fetch, XHR, sendBeacon, WebSocket or
  MediaRecorder upload paths.
- A lawyer-reviewed privacy policy line that matches reality, kept in sync when code changes.

---

## 7. What to show people (for a lawyer to polish)

**A. Age step at sign-up (required to make any of this work).** Neutral date-of-birth or age screen before an
account is created (not "are you under 13?" with an obvious wrong answer; FTC FAQ D.7 on neutral screens). Under
13: no account until a parent consents; collect only the parent's email (and the child's first name or
nickname if needed) to ask for consent, and delete if no consent within a reasonable time (312.5(c)(1)). This
is the existing "parent/guardian-linked" decision.

**B. Parental consent notice, with a camera/mic paragraph (Option 2).** Suggested text:

> **Camera and microphone.** Some basketball and piano activities can use your child's camera or microphone.
> The camera or microphone is only switched on when your child starts one of those activities and they are
> processed on your child's device. Savant never uploads, records or keeps pictures, video or sound. We keep
> only results, such as "shot made" or "notes played correctly", with your child's progress. We do not
> identify your child from their face or voice. Your child's browser or phone will ask for permission each time
> or the first time; you can say no and your child can still do the same activities by tapping or using the
> on-screen keys. You can review and delete your child's results at any time.

**C. Short in-activity notice (child-friendly, replaces the "ask a parent" line).**

> "Your camera stays on this device. Savant doesn't send or save pictures, video or sound, only your score.
> Only film yourself, and ask before filming anyone else."

**D. Privacy policy sections to add**: what the camera/mic features do and that nothing leaves the device;
what results are stored; retention and deletion timeframe (written policy, 2025 rule); any outside vendor that
sees any child data (named, per the 2025 rule); parent rights (review, delete, refuse further collection); how
to contact; the security program summary.

**E. Controls**: camera and mic are off until the learner taps to start (browser permission prompt is the real
gate); a visible indicator while in use; stop on leaving the activity; a tap/keyboard alternative for every
camera/mic task (already built); optional parent setting "Turn off camera and microphone features for this
child" in the parent dashboard. That last item is a convenience, not a legal requirement, and it is cheap
because every block already has a fallback.

---

## 8. UK / EU (GDPR-K, UK Children's Code)

Verified from search: the UK Children's Code (ICO) is a statutory code under s.123 Data Protection Act 2018
with 15 standards, covering services likely to be accessed by under-18s; it stresses high-privacy defaults,
data minimisation, transparency, parental controls, and a DPIA. The rest below is from my own knowledge and
was not re-checked in this session.

- **Age of digital consent (GDPR Art. 8)**: where consent is the legal basis for an online service offered
  directly to a child, the child's own consent is valid from 16 unless a member state lowers it (13 in the UK,
  Denmark and Sweden; 14 in Spain and Italy; 15 in France; 16 in Germany and the Netherlands). Below that age,
  consent must come from the holder of parental responsibility, with reasonable verification. So "under 13"
  is not the right line outside the US; use a per-country age.
- **Is on-device processing "processing"?** Savant's code decides the purposes and means of analysing the
  camera/mic stream, so a cautious reading is that GDPR still applies to the processing, even though no data
  reaches Savant. The household exemption does not apply to Savant. The data-minimisation and storage
  limitation principles are met by design. Treat it as in scope; do not rely on "it never leaves the device"
  as an exemption. ePrivacy Art. 5(3) (accessing information on a user's device) generally needs consent unless
  strictly necessary for a service the user asked for; a user-started camera activity with a permission prompt
  is the best fact pattern.
- **Special category data (Art. 9)**: biometric data is special only if processed "for the purpose of uniquely
  identifying" a person (Art. 4(14); recital 51 says photos are not automatically biometric). Pitch and
  ball/pose tracking for scoring is not identification, so Art. 9 should not apply. Do not add identification.
- **Legal basis**: contract (running the learning service the user signed up for) for core outcome tracking;
  consent for optional camera/mic use, with the parent's consent for children under the national age. The
  sign-up consent paragraph in 7B can serve as the parent's consent for these features.
- **DPIA (Art. 35) and the Children's Code**: a DPIA is the expected step for a children's service using
  innovative technology (camera/mic ML). Do one, short but real, and keep it on file. The DPIA is what shows the
  regulator the on-device design.
- **Children's Code points that bite here**: high-privacy by default (camera/mic off until chosen), tell the
  child in age-appropriate language, minimise data, no nudging to weaken settings, parental-control tools
  must tell the child when a parent is monitoring, geolocation off by default (Savant does not use it).
- **EU AI Act**: avoid emotion recognition from face or voice in education settings (prohibited practice).
  Not an issue unless engagement or emotion inference is added.

---

## 9. Open questions for the lawyer

1. Is a parent account first, then child profile, the intended model, and which consent method (email plus
   vs card/ID/KBA) is acceptable given modelflare.dev and future AI vendors?
2. Is "no collection because on-device" enough in the lawyer's view to skip naming camera/mic in the consent
   (Option 1), or do they want it named (Option 2, recommended)?
3. Basketball_Film blob playback and any planned upload/AI critique: allowed for under 13, and on what
   consent?
4. Confirm the retention period and the deletion mechanism before investors (already a stated risk).
5. Per-country consent ages for the EU launch; DPIA sign-off; UK representative if serving the UK.
6. Whether to rely on the school-consent route for school-managed accounts given Savant's own commercial uses
   of data.

---

## 10. Sources

Primary or near-primary (read in this session):

- eCFR, 16 CFR Part 312 (COPPA Rule): definitions in 312.2 and the 312.5(c) exceptions including (c)(9),
  https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312
- FTC, Complying with COPPA: Frequently Asked Questions (F.1 to F.6 on photos, video, audio, the audio-file
  enforcement policy; F.5 on on-device photo editing; D.4 to D.8 on mixed audience and age screens; I.3 to I.4
  on consent methods; N.1 to N.5 on schools),
  https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- Federal Register, Children's Online Privacy Protection Rule, 22 Apr 2025 (pages 16918 to 16928 on dates,
  mixed audience, the biometric definition and its rationale),
  https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm (only the first part was readable)
- Fenwick, COPPA's Coming of Age: Key Compliance Changes in FTC's Final Rule (secondary, for separate
  disclosure consent, written security program, retention policy, new consent methods),
  https://www.fenwick.com/insights/publications/coppas-coming-of-age-key-compliance-changes-in-ftcs-final-rule
- Mayer Brown, Seventh Circuit Holds That BIPA Does Not Reach Biometric Data That Remains on a User's Device,
  Aug 2026 (G.T. v. Samsung),
  https://www.mayerbrown.com/en/insights/publications/2026/08/seventh-circuit-holds-that-bipa-does-not-reach-biometric-data-that-remains-on-a-users-device
- Duane Morris and ABA summaries of *Barnett v. Apple* (Ill. App. Ct. 2022),
  https://blogs.duanemorris.com/classactiondefense/2023/01/09/illinois-appellate-court-affirms-dismissal-of-bipa-class-action-lawsuit/ and
  https://www.americanbar.org/groups/antitrust_law/resources/newsletters/barnett-v-apple-privacy-by-design/
- Cooley, NetChoice v. Bonta: Ninth Circuit Narrows Injunction Against California's AADC (30 Mar 2026),
  https://www.cooley.com/news/insight/2026/2026-03-30-netchoice-v-bonta-ninth-circuit-narrows-injunction-against-californias-ageappropriate-design-code-act
- ICO, Background to the Children's Code, https://ico.org.uk/about-the-ico/what-we-do/background-to-the-children-s-code/
- Colorado minors and biometric amendments (secondary summaries), https://natlawreview.com/article/colorado-rolls-out-updated-privacy-rules-ahead-2025-cpa-amendments

Not verified in this session (from general knowledge, flagged above): GDPR Arts. 4(14), 8, 9, 35 and recital 51
wording and national consent ages; ePrivacy Art. 5(3); EU AI Act emotion-recognition ban; Texas and Washington
biometric statute wording; New York Child Data Protection Act enacted text; Maryland and Vermont design-code
status; app-store kids policies.

Local files read: `routes/auth.js`, `public-v2/register.html`, `public-v2/onboarding.html`,
`public-v2/js/onboarding.js`, `docs/PRODUCT-DECISIONS.md`, `docs/ROADMAP.md`,
`curriculum-build/SKILL-APPS-MECHANICS.md`, `public-v2/engine/basketball/camera-blocks.js`,
`public-v2/engine/basketball/basketball-blocks.js`, `public-v2/engine/piano/piano-io.js`,
`public-v2/engine/piano/piano-song.js`.

**Not legal advice. Have a lawyer confirm before any under-13 learner uses Savant.**
