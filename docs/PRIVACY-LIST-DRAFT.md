# Draft: corrected company list for the privacy page

DRAFT for the owner and for a lawyer. Not live. `public/privacy.html` and the agreement wording are untouched. Based on `docs/PROVIDER-DATA-MAP.md` (7 Nov 2026). Nothing here is a legal conclusion; section 4 says what a lawyer should read.

## 1. The replacement "Outside AI services" section (plain language)

> **Outside companies that can see what you write or say**
>
> Some features send what a learner writes or says, together with the question it answers, to an outside company so it can reply or mark it. Those features are: the tutor chat, the question coach and "ask about this", chat help inside lessons, essay marking, checking a typed answer our own rules cannot settle, building lessons and levels shaped to a learner (this can include their interests, dislikes and learning notes, not their name or email), building notes, packs and podcast scripts from material you add, and the checking of AI replies before you see them. The Spanish speaking activities, and turning a recording you upload into text, send audio to the speech companies below. A learner's first name goes only to the tutor chat.
>
> These are the companies, and what each one does for Savant:
>
> - **NVIDIA** — the first company asked to answer most chats, marks and lesson writing.
> - **OpenRouter** — a service that passes the request to free AI models (for example Google's Gemma and NVIDIA's Nemotron) when NVIDIA cannot answer.
> - **Anthropic** — a last choice when the others cannot answer.
> - **Standard Compute** — answers tutor chat and writes the tutor's memory notes.
> - **Coral** — answers some tutor replies, writes the first lessons after placement, and checks AI replies before you see them.
> - **Munito**, **Gonka**, **Grokified**, **ZeroGPU** — write and check lessons, levels, notes and packs; ZeroGPU and Coral also check replies live.
> - **Gladia** — turns an audio or video file you upload into text (adult accounts only).
> - **Xiaomi (MiMo)** — turns Spanish speaking recordings into text.
> - **LLM Gateway**, which passes audio to voice companies it works with (ElevenLabs for speech, xAI for listening) — Spanish speaking practice and the tutor's voice, for accounts the operator has switched on only. *(Tutor voice call: add when it ships.)*
> - **Google** — reads Spanish lessons aloud. It receives the lesson line, not a learner's own words.
> - **Your browser's own speech recognition** (in Chrome this is run by Google, in Safari by Apple, in Edge by Microsoft) — when you tap Speak in the tutor chat, or speak Spanish and our own service is unavailable, your browser may send your voice to its maker. Savant does not receive or control this.
>
> *(Per company: say what each says about keeping and training. Today that is unknown for most, see below. Do not print "under their terms for business customers" for companies whose terms were not read.)*
>
> For a child account all of this stays off unless a parent turns on "outside AI" on the parent page and returns the signed form. A child can never upload a recording or file. *(Check: with the parent's choice on, a child's typed words can reach all the companies above except Gladia.)*
>
> **Other companies that help run Savant:** Onidel (our server host, New York) — *(confirm region and terms)*; an email provider (Resend or Brevo) for invitation and parent emails — *(confirm which)*.

## 2. Companies on the live page that should come off or change

| Page now | Reality | Draft change |
|---|---|---|
| modelflare.dev "writes the shared placement quizzes" | Switched off (no `MODELFLARE_ENABLED`), banned by the owner, never carried learner data | Remove |
| Google (Gemini, including its speech service) | Gemini text chain is off on the server; Google only reads Spanish lines aloud there. Browser recognition is separate and undisclosed | Reword as above |
| Xiaomi (MiMo, including its speech service) | Text use is off; speech-to-text for Spanish recordings is live | Reword: speech only |
| Standard Compute "NEVER for a learner under 13..." | Matches the code (refused without active consent plus opt-in). Also writes "tutor facts" | Add facts; keep the rule only once confirmed |
| LLM Gateway "adult accounts the operator has switched on only" | The code checks the operator's list (1 account), not age | Keep only if the list is adults; say who is on it |
| Missing: Coral, Munito, Gonka, Grokified, ZeroGPU, Gladia, xKiro | Coral, Munito, Gonka, Grokified, ZeroGPU and Gladia can receive learner data on the server today. xKiro cannot (window closed 7 Nov, not wired to learners). Lyceum has no key on the server | Add the first six; omit xKiro and Lyceum |
| Missing: browser speech recognition | Tutor "Speak" and Spanish fall back to it | Add |
| Missing: email provider and host named only as blanks | Resend or Brevo for scripts; Onidel hosts | Fill in |

## 3. Statements on the page that are now false or need the owner

1. **"A recording is turned into text on our own server with an open speech model... no outside speech service is used"** (My material row, and the video file text). False: for a consenting 13+ learner Gladia is the first route; local Whisper is only the fallback. Must change or Gladia must be switched off (`GLADIA_LEARNER=off`).
2. **"Modelflare ... writes the shared placement quizzes"** — false today.
3. **"Under their terms for business customers"** — I could not confirm this for Coral, Munito, Gonka, Grokified, ZeroGPU, Standard Compute, NVIDIA's API catalog. The code itself says Standard Compute's retention and training terms for children's data are unknown.
4. **"We do not use children's data to train AI models"** — Savant does not train models, but the page implies the companies do not either. Unverified for every vendor; for OpenRouter free models the model makers' own terms apply and OpenRouter says some may train. Needs the owner's wording choice and counsel.
5. **"We never sell your data"** (top bullet and "How we use it") — the owner's call; nothing in the code sells data, but that is a legal claim to leave to counsel.
6. **"The camera and microphone tools work on your device. No picture, video or sound is uploaded"** (top bullet) — true for basketball and piano; not true for the tutor's Speak button (browser recognition sends audio to the browser maker), Spanish speaking, or uploaded audio. Narrow the sentence to the camera/piano/basketball tools.
7. **"Pages may send data only to Savant itself"** — true for page scripts (CSP `connect-src 'self'`), but the browser's own speech recognition is outside it.
8. **"Draft for legal review: the parts marked like this are filled in before launch" and blank operator name and address, contact email, response time, hosting provider and region, email provider, inactive-account period, consent-record period, security review frequency** — still blank. The agreement screen and the sign-up line link here and the application promises "you see it before you start", so these must be filled before 15 Nov.
9. **"Learners under their country's consent age ... outside AI services stay off"** — true by the gate, but "a child account" with parent opt-in does reach the added providers (until 14 Nov for under-13) and NVIDIA, Standard Compute, OpenRouter and Anthropic after.
10. **Retention row "Study material ... sent to the AI services Savant uses for learners"** — now includes Coral, Munito, Gonka, Grokified (list them).

## 4. What each company's own terms say (only what I could read, 7 Nov)

| Company | Training | Retention | Source read |
|---|---|---|---|
| Anthropic | Not stated on the retention page; check Commercial Terms and DPA | API inputs and outputs deleted within 30 days (up to 2 years if flagged by safety systems) | privacy.claude.com article 7996866 |
| OpenRouter | OpenRouter says it does not use inputs for its own training (under "Enterprise and API users"); some model providers may; free models not distinguished | Input retention period not stated; media not kept beyond routing | openrouter.ai/privacy |
| Google Gemini API | Unpaid use: may be used to improve Google products and read by human reviewers. Paid (billed project): not used | Paid: logged for a limited period for abuse/legal, period not stated; unpaid: not stated | aistudio.google.com/docs/terms |
| LLM Gateway | States it does not train on customer data; the model companies behind it have their own terms | Metadata only by default; content kept only for certain organizations that opt in | llmgateway.io/privacy (audio not mentioned) |
| Gladia | Not stated for customer audio | Audio retention not stated; deleted on client instruction when it is processor | gladia.io/privacy-policy |
| NVIDIA | Page does not cover API-catalog inputs | Not stated for inputs | nvidia.com privacy policy |
| Coral, Munito, Gonka, Grokified, ZeroGPU, Lyceum, Standard Compute, MiMo, xAI, ElevenLabs, Onidel, Resend, Brevo | unknown | unknown | Not found or not read (munito.ai/privacy and zerogpu.ai/privacy returned 404; stdcmpt.com did not resolve) |

## 5. What a lawyer should read

- Each vendor's actual API terms and data processing addendum, especially for the six unread "added" providers and for OpenRouter's free models, before any child's words reach them.
- Whether naming a company is enough, or the page must say what each keeps and for how long.
- Under-13 and under-16 rules for sending children's text to these companies with a parent's opt-in (COPPA, GDPR-K): the code allows it; whether the signed parent form's wording covers these companies is for counsel.
- Browser speech recognition: whether Savant must disclose a third-party service it does not control.
- The "we never sell" and "no training" claims, and whether a testing-phase notice differs from the launch notice.
- The 14 Nov 06:00Z end of the added-provider clearance and whether the page should state it.

## 6. Questions for the owner (10 Nov)

1. Munito, Coral and Gladia have **no end date for 13+ learners in the code**; only Gonka, Grokified, ZeroGPU, Lyceum and under-13 access end 14 Nov. Do you want those cut too (set `MUNITO_LEARNER=off`, `CORAL_LEARNER=off`, `GLADIA_LEARNER=off`), or kept?
2. Standard Compute is the tutor's default and its terms are unknown. Keep on, off, or only after you have read them?
3. Switch Gladia off until the page says so, or reword the page?
4. Is the browser's speech recognition acceptable for the tutor Speak button, or hide it for children or everyone?
5. Resend or Brevo, and who runs the invite script?
6. Is the single LLM Gateway account an adult?
7. Does the test launch really give under-age testers full access (memory note)? This branch's consent gate does not.
