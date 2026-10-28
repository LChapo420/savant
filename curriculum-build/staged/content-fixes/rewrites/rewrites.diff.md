# Staged corrections (not applied)

### block_plans 1 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ blocks[0].data.rightChoice.body
- "The buzzer beat us by half a second, we lost."
+ "The buzzer beat us by half a second, and we lost."
@@ blocks[0].data.rightChoice.title
- The buzzer beat us by half a second, we lost.
+ The buzzer beat us by half a second, and we lost.
@@ blocks[6].data.paragraph
- Because the gym was booked, practice was moved. My coach texted the team we all showed up late, the warm-up was rushed.
+ Because the gym was booked. Practice was moved. My coach texted the team we all showed up late, the warm-up was rushed.
@@ blocks[6].data.tokens[8].text
- booked,
+ booked.
@@ blocks[6].data.tokens[10].text
- practice
+ Practice
@@ blocks[7].data.context
- The alarm didn't go off because the power had gone out overnight, we overslept by an hour.
+ The alarm didn't go off because the power had gone out overnight.
@@ blocks[7].data.commonErrorLabel
- Trusting 'it has a comma and a subject-verb pair, so it's fine'
+ Assuming every sentence with 'because' in it is a fragment
@@ blocks[7].data.trapReasons.0
- Longer and starting with 'because' tricks you into expecting a missing piece.
+ The long 'because' clause tricks you into expecting a missing piece.
@@ blocks[7].data.trapReasons.3
- There is no comma joining two full clauses — the comma sits inside the dependent clause.
+ There is no comma at all, so nothing is splicing two full clauses together.

### block_plans 10 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ blocks[7].data.statements[2].text
- Never end a sentence with a preposition.
+ Ending a sentence with a preposition is acceptable.
@@ blocks[7].data.statements[2].feedback
- No modern style guide enforces this one; it is a myth, not a rule.
+ Modern style guides agree this is fine; the old 'never end with a preposition' rule is a myth, not a rule.

### block_plans 12 — verified: code checks + MiniMax review + cross-family review
@@ blocks[1].data.cards[5].explanation
- Two clauses are okay when they are joined correctly with because.
+ Two clauses are okay when they are joined correctly with although.

### block_plans 17 — verified: code checks + MiniMax review + cross-family review
@@ blocks[0].data.cards[5].explanation
- No subject and no verb — this is an accidental fragment, not a stylistic choice.
+ The clause has a subject ('the store') and a verb ('was closed'), but it is an accidental fragment because the dependent clause stands alone.
@@ blocks[0].data.cards[9].explanation
- 'Leaving' isn't a main verb here, so there's no complete predicate.
+ Here, 'Running' and 'skipping' are non-finite verbs, so the fragment has no finite main verb.
@@ blocks[4].data.lines[1].explanation
- Two complete sentences fused together: 'People assume...' and 'but the studies...' have no punctuation or connector joining them. This is a run-on.
+ Two complete sentences fused together: 'People assume longer school days mean more learning' and 'the studies show the opposite is often true' have no punctuation or connector joining them. This is a run-on.
@@ blocks[4].data.completionMessage
- Found it. Line 2 fuses two complete sentences — 'People assume...' and 'but the studies...' — with no punctuation between them. Fix it with a period, semicolon, or a connector like 'but'.
+ Found it. Line 2 fuses two complete sentences — 'People assume longer school days mean more learning' and 'the studies show the opposite is often true' — with no punctuation or connector between them. Fix it with a period, semicolon, or a connector like 'but'.

### block_plans 18 — verified: code checks + MiniMax review + cross-family review
@@ blocks[1].data.statements[2].feedback
- Deliberate shift for effect — a command dropped in after a statement, clearly marked by 'Do not' and the dash. That's a writer's choice, not an accident.
+ Deliberate shift for effect — a command dropped in after a statement, clearly marked by 'Do not' alone. That's a writer's choice, not an accident.

### block_plans 19 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ blocks[1].data.cards[1].correctBucket
- shift
+ consistent
@@ blocks[1].data.cards[1].detail
- Mood flips: indicative to imperative
+ Mood stays indicative: the infinitives report the recipe
@@ blocks[1].data.cards[1].explanation
- The sentence starts in indicative (tells a fact) and flips to imperative (a command) with no punctuation or marker to signal it.
+ The sentence states a fact about the recipe. 'To preheat' and '(to) stir' are both infinitives telling what the recipe says, so there is no command and no shift.

### block_plans 2 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ blocks[7].data.chips[0].text
- the sky writes poems
+ —
@@ blocks[7].data.chips[1].text
- poetry builds attention
+ patience builds attention
@@ blocks[7].data.chips[1].correctIndex
- 1
+ 2
@@ blocks[7].data.chips[2].correctIndex
- 2
+ 1
@@ blocks[7].data.chips[3].text
- Reading builds patience
+ Reading builds patience,
@@ blocks[7].data.chips[4].text
- attention builds understanding
+ reading
@@ blocks[7].data.chips[4].correctIndex
- 4
+ 5
@@ blocks[7].data.chips[5].text
- so poetry builds understanding
+ so
@@ blocks[7].data.chips[5].correctIndex
- 5
+ 4
@@ blocks[7].data.chips[6].text
- the sky writes poems
+ builds attention.
@@ blocks[7].data.tokens[0].text
- Reading builds patience
+ Reading builds patience,
@@ blocks[7].data.tokens[1].text
- poetry builds attention
+ patience builds attention
@@ blocks[7].data.tokens[3].text
- the sky writes poems
+ —
@@ blocks[7].data.tokens[4].text
- attention builds understanding
+ reading
@@ blocks[7].data.tokens[5].text
- so poetry builds understanding
+ so
@@ blocks[7].data.tokens[6].text
- the sky writes poems
+ builds attention.
@@ blocks[7].data.feedbackCorrect
- Balanced. Each half mirrors the same subject + verb + object shape, and the extension echoes it too.
+ Balanced. 'Reading builds patience' and 'patience builds attention' share the same subject + verb + object shape, and the ending echoes it: reading builds attention.
@@ blocks[7].data.hintText
- Start with the first parallel half: "Reading builds patience." The halves must share the same shape.
+ Start with the first parallel half: "Reading builds patience," then let the second half mirror it.
@@ blocks[3].data.after.caption
- Two matching halves, mirrored on either side of the dash: practice builds / confidence builds.
+ Two matching halves, mirrored on either side of "and": practice builds confidence / confidence builds success.

### block_plans 21 — verified: code checks + MiniMax review + cross-family review
@@ blocks[0].data.cards[0].explanation
- The singer (subject) does the action directly.
+ The crowd (subject) does the action directly.
@@ blocks[0].data.cards[2].explanation
- If plus would is a conditional if-clause structure.
+ This first conditional uses if + present / will: 'If it rains tomorrow, the game will be moved indoors.'
@@ blocks[5].data.cells[2].answer
- Two or more words are missing; it has no subject or no verb, so it cannot stand alone.
+ Only the subject is missing; the verb 'ran' is present, so it cannot stand alone.

### block_plans 23 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ blocks[0].data.cards[4].correctBucket
- semicolon
+ colon
@@ blocks[0].data.cards[4].explanation
- The first half is a complete sentence, so a semicolon (not a colon) fits before the list.
+ The first half is a complete sentence that introduces a list, so a colon fits; a semicolon cannot introduce a list.
@@ blocks[1].data.items[0].chunks[3].text
- match the mood of the sentence:
+ matched the mood of the sentence —
@@ blocks[1].data.items[0].chunks[4].text
- match the mood of the sentence
+ matched the mood of the sentence;
@@ blocks[1].data.items[0].solution[1]
- match the mood of the sentence:
+ matched the mood of the sentence —
@@ blocks[1].data.items[1].chunks[0].text
- My brother
+ My brother —
@@ blocks[1].data.items[1].chunks[2].text
- the one who never opens a book
+ the one who never opens a book —
@@ blocks[1].data.items[1].solution[0]
- My brother
+ My brother —
@@ blocks[1].data.items[1].solution[1]
- the one who never opens a book
+ the one who never opens a book —
@@ blocks[1].data.items[3].chunks[0].text
- The recipe needed one unusual thing
+ The recipe needed one unusual thing:
@@ blocks[1].data.items[3].solution[0]
- The recipe needed one unusual thing
+ The recipe needed one unusual thing:
@@ blocks[1].data.items[3].solution[1]
- a pinch of cinnamon:
+ a pinch of cinnamon
@@ blocks[2].data.cells[3].answer
- Yes
+ No
@@ blocks[2].data.cells[3].acceptedAnswers[0]
- yes it does
+ no
@@ blocks[2].data.cells[3].acceptedAnswers[1]
- no
+ no, not required
@@ blocks[2].data.cells[3].acceptedAnswers[2]
- n/a - not required
+ not required
@@ blocks[2].data.rows[2].label
- What follows when a transition word like however comes next?
+ What punctuation goes right after the mark itself?
@@ blocks[2].data.cells[6].answer
- Comma
+ Nothing
@@ blocks[2].data.cells[6].acceptedAnswers[0]
- a comma
+ no comma
@@ blocks[2].data.cells[6].acceptedAnswers[1]
- comma after it
+ nothing
@@ blocks[2].data.cells[8].answer
- Comma
+ Nothing
@@ blocks[2].data.cells[8].acceptedAnswers[0]
- a comma
+ no comma
@@ blocks[2].data.cells[8].acceptedAnswers[1]
- comma after it
+ nothing
@@ blocks[2].data.cells[8].feedback
- Semicolon, then the transition word, then a comma.
+ Nothing goes right after the semicolon itself; with a transition word like however, the comma comes after however.
@@ blocks[2].data.cells[9].answer
- isn't
+ its
@@ blocks[2].data.cells[9].acceptedAnswers[0]
- is not
+ its
@@ blocks[2].data.cells[10].answer
- it's
+ its
@@ blocks[2].data.cells[10].acceptedAnswers[0]
- it is
+ its
@@ blocks[2].data.cells[10].feedback
- Expand it to it is to check: the idea it is about.
+ Expand it's to it is to check: 'held it is nickname' makes no sense, so the answer is its.

### block_plans 3 — verified: code checks + MiniMax review + cross-family review
@@ blocks[2].data.leftColumn.items[0].example
- 'Sleep matters.' — short, deliberate, punchy.
+ 'The research is clear. Plain and simple.' — short, deliberate, punchy.
@@ checks[2].prompt
- A student, arguing for a later school start, writes: 'The research is clear. Sleep matters.' The second piece — 'Sleep matters.' — is best described as which of the following?
+ A student, arguing for a later school start, writes: 'The research is clear. Plain and simple.' The second piece — 'Plain and simple.' — is best described as which of the following?
@@ checks[2].rationale
- 'Sleep matters.' has a subject and a verb and is set off on purpose after a complete sentence it echoes, so it is a deliberate fragment — not a run-on, which would need two complete sentences joined without punctuation.
+ A deliberate fragment follows a complete sentence and echoes it in a compressed form, so the reader feels the punch instead of noticing a missing piece. 'Plain and simple.' echoes the idea of clear research in three words — deliberately incomplete, and clearly so.
@@ blocks[5].data.cautions[3].rightExample
- Wrinkled. Stained. Perfect anyway. (a deliberate fragment pair after a full sentence)
+ Wrinkled. Stained. Perfect anyway. (three fragments with no preceding full sentence)

### block_plans 4 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ blocks[4].data.options[1].text
- The committee voted on the proposal, and the results was announced by the chair.
+ The committee voted on the proposal, and the results were announced by the chair.
@@ blocks[4].data.feedback.byOption.d
- Starting active and then issuing a command can be a mood shift, but this option's shift is smooth and there is no jarring change here.
+ This sentence is imperative and active throughout (stir, then pour), so neither the voice nor the mood shifts.
@@ checks[3].accepts
- should be,should stay,must be,must stay
+ be

### block_plans 5 — verified: code checks + MiniMax review + cross-family review
@@ blocks[9].data.prompt
- A student wrote: "Wear gloves when handling dry ice, and be careful." The sentence shifts mood from imperative to imperative — that is fine — but it also shifts voice when the doer changes. Which revision keeps voice and mood consistent in BOTH clauses while leaving the sentence as one?
+ A student wrote: "Wear gloves when handling dry ice, and be careful." The sentence has no voice shift: both clauses are active imperatives with the same understood subject. Which revision keeps voice and mood consistent in BOTH clauses while leaving the sentence as one?
@@ blocks[9].data.choices[1].label
- Keep both clauses, but change "watch out" to "you must watch out."
+ Keep both clauses, but change "be careful" to "please be careful."

### block_plans 6 — verified: code checks + MiniMax review + cross-family review
@@ blocks[2].data.prerequisites[3]
- Conditional: an if/then situation that could happen. 'If it rains, we would move the picnic indoors.'
+ Conditional: an if/then situation that could happen. 'If it rains, we will move the picnic indoors.'
@@ blocks[8].data.expansions[2].phrase
- Conditional — imagined but possible: 'If we hurry, we would catch it.'
+ Conditional — imagined but possible: 'If we hurried, we would catch it.'

### block_plans 9 — verified: code checks + MiniMax review + cross-family review
@@ blocks[4].data.feedback.byOption.d
- That is not a real word. The noun is effect.
+ "Effected" is a real word: it is the past tense of the verb "effect," meaning "to bring about." In this sentence, though, you need the noun "effect."
@@ blocks[5].data.items[0].detail
- "We left early because the bus never came." — notice the second part has no subject and verb.
+ "We left early because the bus never came." — "because the bus never came" has the subject "the bus" and finite verb "came"; it is a fragment when it stands alone because it is a dependent clause.

### lessons 1219 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ common_mistakes[3]
- Reading x - 7 = 5 and subtracting 7 from both sides, getting x = -2. Subtracting makes the minus 7 bigger; adding 7 is what makes it vanish, giving x = 12.
+ Undoing the - 7 in x - 7 = 5 by subtracting 7 from 5 and writing x = 5 - 7 = -2. Subtracting does not cancel a subtraction; adding 7 to both sides cancels the - 7 and gives x = 12.

### lessons 1220 — verified: code checks + MiniMax review + cross-family review
@@ sections[0].body
- Some verbs never stand alone. Can, could, will, would, shall, should, may, might, must, do, does, did, have, has, had. Each one borrows its meaning from the next verb, and that next verb is called the main verb. If the main verb never shows up, the clause has a subject and a verb-shaped word, but no actual action. It is a fragment.
+ Only the modal verbs never stand alone. Can, could, will, would, shall, should, may, might, and must need another verb. Do, does, and did can be main verbs: I did the work. Have, has, and had can be main verbs too: She has a cat. A helper verb can appear with a main verb, which carries the clause's meaning. If the main verb is missing, the clause has a subject and a verb-shaped word, but no complete action. It is a fragment.
@@ sections[0].example
- Wrong: She could have finished the report. ... No, wait, that is complete because finished is the main verb. Here is the fragment: She could have had. Now read it. Could have had what? Nothing. The main verb is gone, so the thought stops. Fix it by adding the main verb: She could have had it finished by noon. Now the helpers (could have) point to a real verb (finished), and the thought is done.
+ Wrong: She could have finished the report. ... No, wait, that is complete because finished is the main verb. Here is the fragment: She could have had. Now read it. Could have had what? Nothing. Had is the main verb here, but it has no object, so the thought stops. Fix it by adding the missing words: She could have had it finished by noon. In the fixed sentence, had is the main verb, and finished is a participle complement. The thought is done.
@@ sections[1].example
- Wrong: Walking to the store, her phone rang. Her phone is the subject and rang is the verb, so why is this a problem? Because walking to the store is a dangling piece: it describes the person, not the phone, and it has no main verb of its own. It is a fragment attached to the wrong subject. Fix it: Walking to the store, I heard my phone ring. Now I is the person walking, and heard is the real verb the -ing phrase leads into. The fragment is gone.
+ Wrong: Walking to the store, her phone rang. Her phone is the subject and rang is the verb, so why is this a problem? Because walking to the store is a dangling modifier: it refers to a person, but her phone is the subject. The sentence is not a fragment; it has a subject and a finite verb. Fix it: Walking to the store, I heard my phone ring. Now the -ing phrase modifies I, and heard is the main verb that the phrase leads into. The dangling modifier is gone.
@@ sections[2].example
- Take this: After the meeting, tired and sore, everyone sat down. Pause. After the meeting is fine, a full prepositional phrase. But tired and sore, is a description with no verb. It dangles between the two real pieces. You can either give it a verb or fold it into the next clause: After the meeting, everyone, tired and sore, sat down. Now tired and sore is a short aside set off by commas, and the main sentence is everyone sat down. The fragment is absorbed, and the thought completes.
+ Take this: After the meeting, tired and sore, everyone sat down. Pause. After the meeting is a full prepositional phrase, and tired and sore is an adjective phrase modifying everyone. The sentence is complete: everyone sat down is the main clause. The commas set off the description; they do not make a verbless phrase into a clause. You can also put the description next to the subject: After the meeting, everyone, tired and sore, sat down. Both sentences are complete and correct.

### lessons 1272 — verified: code checks + MiniMax review + cross-family review
@@ sections[1].body
- The rule: times, product, and twice mean multiply, and you can write multiplication by sticking the number next to the variable, like 3n. Divided by, half of, and per mean divide, and the thing named FIRST goes on top of the fraction. So a number divided by 4 is n/4, while 4 divided by a number is 4/n.
+ The rule: times, product, and twice mean multiply, and you can write multiplication by sticking the number next to the variable, like 3n. Divided by and per mean divide, and the thing named FIRST goes on top of the fraction; "half of" is an exception, because "half of a number n" is n/2. So a number divided by 4 is n/4, while 4 divided by a number is 4/n.
@@ summary
- Translate words by swapping plus, sum, more than, and increased by for +, minus, less than, and decreased by for -, times, product, and twice for multiplication, and divided by for division. Start with the amount the phrase names first, so "less than" and "more than" attach to what comes before them. Build each piece like 3n or n/4 in the order the words give you.
+ Translate words by swapping plus, sum, more than, and increased by for +, minus, less than, and decreased by for -, times, product, and twice for multiplication, and divided by for division. Start with the amount being compared, so the number named first comes SECOND in both "less than" and "more than"; for example, "7 less than n" is n - 7. Build each piece like 3n or n/4 in the order the words give you.

### lessons 130 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- Using the wrong opposite: in x - 7 = 12, subtracting 7 from both sides gives x = 5, and the check 5 - 7 = -2 does not equal 12. The - 7 needs + 7.
+ Using the wrong opposite: in x - 7 = 12, subtracting 7 from both sides gives x - 14 = 5 (x = 19), not x = 5. The slip that gives 5 is computing 12 - 7. The - 7 needs + 7: add 7 to both sides to get x = 19.

### lessons 131 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- In x + 7 = 12, subtracting 7 from the right side only. That gives x = 12, because you never balanced the left side. Subtract 7 from both sides to get x = 5.
+ In x + 7 = 12, subtracting 7 from the right side only. That gives x + 7 = 5; x = 12 comes from removing the 7 on the left side only. Subtract 7 from both sides to get x = 5.
@@ common_mistakes[1]
- In x - 4 = 10, subtracting 4 from both sides instead of adding 4. That gives x = 6, and 6 - 4 = 2 does not equal 10. The opposite of minus 4 is plus 4.
+ In x - 4 = 10, subtracting 4 from both sides instead of adding 4. That gives x - 8 = 6, so x = 14, not x = 6. The opposite of minus 4 is plus 4, so add 4 to both sides to get x = 14.
@@ common_mistakes[3]
- In x / 5 = 4, dividing both sides by 5 again. That gives x = 4/5, but (4/5) / 5 is not 4. The x is divided by 5, so multiply both sides by 5 to get x = 20.
+ In x / 5 = 4, dividing both sides by 5 again. That gives x / 25 = 4/5, so x = 20, not x = 4/5. The x is divided by 5, so multiply both sides by 5 to get x = 20.

### lessons 1510 — verified: code checks + MiniMax review + cross-family review
@@ sections[1].body
- "ch" in "chip" makes the ch sound, and removing it leaves "kip", which is a different word.
+ "ch" in "chip" makes the ch sound, and removing it leaves "ip", which is a different word.

### lessons 1801 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ sections[0].body
- Rule: "sum" and "more than" mean add, and "less than" means subtract with the words in reverse order. "More than" keeps the order the same, so 5 more than a number is x + 5. "Less than" flips it, so 3 less than a number is x - 3, never 3 - x.
+ Rule: "sum" and "more than" mean add, and "less than" means subtract with the words in reverse order. With "more than" either order is right, because addition can be done in either order: 5 more than a number is x + 5 or 5 + x. "Less than" flips it, so 3 less than a number is x - 3, never 3 - x.

### lessons 193 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[1]
- In 2x + 7 = 17, dividing only the left side by 2 gives x + 7 = 17 and then x = 10. The two sides no longer hold the same value, and the check fails: 2 * 10 + 7 = 27, not 17.
+ Mistake: dividing only the 2x term in 2x + 7 = 17 gives x + 7 = 17 and then x = 10. Dividing the whole left side of 2x + 7 = 17 by 2 gives x + 3.5; x + 7 = 17 comes from dividing only the 2x term. The original equation fails the check: 2 * 10 + 7 = 27, not 17.

### lessons 2040 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ summary
- Give the unknown a letter first, then let the words choose the operation. Remember that \"less than\" and \"more than\" put the number on the left of the operation, and that \"times,\" \"product of,\" and \"twice\" write the number right next to the letter.
+ Give the unknown a letter first, then let the words choose the operation. Remember that "less than" flips the order, so 7 less than n is n - 7, with the number on the right; with "more than," n + 9 and 9 + n are equal. "Times," "product of," and "twice" write the number right next to the letter.

### lessons 2144 — verified: code checks + MiniMax review + cross-family review
@@ sections[0].body
- The rule: the words sum, plus, and more than mean add; difference, minus, and less than mean subtract. Write the expression in the same order the words appear, except that more than and less than put the named number first. Example: the sum of a number x and 5 becomes x + 5.
+ The rule: the words sum, plus, and more than mean add; difference, minus, and less than mean subtract. Write the expression in the same order the words appear, except that more than and less than put the named number second. Example: the sum of a number x and 5 becomes x + 5.

### lessons 232 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- Using the same operation instead of the opposite. In x + 7 = 12, adding 7 to both sides gives x = 19, which is wrong because 19 + 7 = 26, not 12. You needed to subtract 7.
+ Using the same operation instead of the opposite. Adding 7 to both sides of x + 7 = 12 gives x + 14 = 19 (x = 5), not x = 19. You needed to subtract 7.

### lessons 233 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ common_mistakes[0]
- Dividing 3x + 5 = 20 by 3 first and writing x + 5 = 6.67. The +5 is an addition, not a factor, so it does not get divided. Subtract 5 first, giving 3x = 15.
+ Dividing 3x + 5 = 20 by 3 first and writing x + 5 = 6.67. Dividing both sides by 3 divides every term, so the +5 becomes 5/3: x + 5/3 = 20/3. It is simpler to subtract 5 first, giving 3x = 15 and x = 5.
@@ check_questions[2].rationale
- Dividing first would give x = 2.5, and x = 3 is not correct since 2(3) + 4 = 10 fails. Their answer shows 2x = 6 came from subtracting 4 from only one side... actually the deciding check: substituting 3 gives 2(3) + 4 = 10, which is true, so x = 3 is correct and nothing went wrong.
+ Substitute to check: 2(3) + 4 = 6 + 4 = 10, which matches the right side, so x = 3 is correct and nothing went wrong.

### lessons 234 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- Adding 7 to both sides of x + 7 = 12. You must undo the addition, so this move gives 19 on the right and x = 19, which is wrong. The fix is to subtract 7.
+ Mistake: adding 7 to both sides of x + 7 = 12 and writing x = 19. This move gives x + 14 = 19, so x = 5, not x = 19. You must undo the addition by subtracting 7 from both sides.

### lessons 2813 — verified: code checks + MiniMax review + cross-family review
@@ sections[1].body
- Rule: a bar like the one in 12x/3 means divide everything on top by everything on the bottom. The top 12x is 12 times x, so the 3 divides both the 12 and the x. Let's see it work: 12 divided by 3 is 4, so 12x/3 = 4x. Check with x = 2: 12 times 2 is 24, and 24 divided by 3 is 8. And 4x with x = 2 is 8 too.
+ Rule: a bar like the one in 12x/3 means divide everything on top by everything on the bottom. The top 12x is 12 times x, so 12x/3 = (12/3)x = 4x: dividing a product divides one factor; the 3 does not divide both the 12 and the x. Let's see how it works: 12 divided by 3 is 4, so 12x/3 = 4x. Check with x = 2: 12 times 2 is 24, and 24 divided by 3 is 8. And 4x with x = 2 is 8 too.

### lessons 2850 — verified: code checks + MiniMax review + cross-family review
@@ sections[1].example
- "Jaw-broken silence" or the classic "deafening silence" is an oxymoron: silent and loud are opposites, yet one is piled on the other. Other clean cases: "bittersweet," "open secret," "alive dead." Notice the structure: opposite adjective + noun (or two conflicting words side by side). The phrase is not a complete claim that is secretly true; it is a compressed, contradictory image.
+ "Jaw-broken silence" is not an oxymoron: its words do not contradict each other. The classic "deafening silence" is: silent and loud are opposites, yet one is piled on the other. Other clean cases: "bittersweet," "open secret," "alive dead." Notice the structure: opposite adjective + noun (or two conflicting words side by side). The phrase is not a complete claim that is secretly true; it is a compressed, contradictory image.

### lessons 30 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ sections[0].body
- Whatever you do to one side of an equation, you must do to the exact same side or the opposite side to keep it balanced. To isolate a variable, you undo whatever operation is currently applied to it by using its opposite, or inverse, operation. Addition and subtraction are inverses of each other, and multiplication and division are inverses of each other.
+ Whatever you do to one side of an equation, you must also do to the other side to keep it balanced. To isolate a variable, you undo whatever operation is currently applied to it by using its opposite, or inverse, operation. Addition and subtraction are inverses of each other, and multiplication and division are inverses of each other.

### lessons 3069 — verified: code checks + MiniMax review + cross-family review
@@ sections[0].example
- Take the idea of sight. Latin o- / oc- / vis- give you visible, occur, vision. Greek -opt / -scop / -graph give you telescope, optical, biography. Both mean something with sight, but the Latin set is everyday and the Greek set is the scientific, specialized version. A reader of "optical instrument" already expects a laboratory tool; a reader of "vision board" expects a poster on a wall.
+ Take the idea of sight. Latin o- / oc- / vis- give you visible, occur, vision. Greek -opt / -scop give you optical and telescope, while -graph gives you biography. -opt- and -scop- are sight roots; -graph- means "write" (biography = life-writing). The Latin sight set is everyday, while the Greek sight roots are the scientific, specialized version. A reader of "optical instrument" already expects a laboratory tool; a reader of "vision board" expects a poster on a wall.
@@ sections[2].example
- Sentence: "The physician's diagnosis revealed a chronic condition that would require frequent observation." Diagnosis and condition are Latin-family (general, professional). Chronic is Greek-family (specialized, medical). Frequent is Latin-family (everyday). The sentence is doing real work with this mix: the doctor is professional (Latin), the condition is medical (Greek), and the follow-up is routine (Latin). If the writer had said "The physician's diagnosis revealed a periodic condition requiring recurrent observation," every word would be Latin-family, and the medical weight would disappear. The Greek word chronic is what pins the sentence to a medical register.
+ Sentence: "The physician's diagnosis revealed a chronic condition that would require frequent observation." Diagnosis is Greek-family (specialized, medical), while condition is Latin-family (general in origin). Chronic is Greek-family (specialized, medical). Frequent is Latin-family (everyday). The sentence is doing real work with this mix: the doctor is professional (Latin), the condition is medical (Greek), and the follow-up is routine (Latin). If the writer had said "The physician's diagnosis revealed a periodic condition requiring recurrent observation," every word would be Latin-family, and the medical weight would disappear. The Greek word chronic is what pins the sentence to a medical register.
@@ sections[2].example
- Sentence: "The physician's diagnosis revealed a chronic condition that would require frequent observation." Diagnosis is Greek-family (specialized, medical), while condition is Latin-family (general in origin). Chronic is Greek-family (specialized, medical). Frequent is Latin-family (everyday). The sentence is doing real work with this mix: the doctor is professional (Latin), the condition is medical (Greek), and the follow-up is routine (Latin). If the writer had said "The physician's diagnosis revealed a periodic condition requiring recurrent observation," every word would be Latin-family, and the medical weight would disappear. The Greek word chronic is what pins the sentence to a medical register.
+ Sentence: "The physician's diagnosis revealed a chronic condition that would require frequent observation." Diagnosis is Greek-family (specialized, medical), while condition is Latin-family (general in origin). Chronic is Greek-family (specialized, medical). Frequent is Latin-family (everyday). The sentence is doing real work with this mix: diagnosis and chronic carry the specialized medical load, while condition stays Latin-family and frequent keeps the follow-up routine. If the writer had said "The physician's diagnosis revealed a periodic condition requiring recurrent observation," every word would be Latin-family, and the medical weight would disappear. The Greek word chronic is what pins the sentence to a medical register.
@@ sections[2].example
- Sentence: "The physician's diagnosis revealed a chronic condition that would require frequent observation." Diagnosis is Greek-family (specialized, medical), while condition is Latin-family (general in origin). Chronic is Greek-family (specialized, medical). Frequent is Latin-family (everyday). The sentence is doing real work with this mix: diagnosis and chronic carry the specialized medical load, while condition stays Latin-family and frequent keeps the follow-up routine. If the writer had said "The physician's diagnosis revealed a periodic condition requiring recurrent observation," every word would be Latin-family, and the medical weight would disappear. The Greek word chronic is what pins the sentence to a medical register.
+ Sentence: "The physician's diagnosis revealed a chronic condition that would require frequent observation." Diagnosis is Greek-family (specialized, medical), while condition is Latin-family (general in origin). Chronic is Greek-family (specialized, medical). Frequent is Latin-family (everyday). The sentence is doing real work with this mix: diagnosis and chronic carry the specialized medical load, while condition stays Latin-family and frequent keeps the follow-up routine. If the writer had said "The physician's diagnosis revealed a periodic condition requiring recurrent observation," the Latin-family time words would replace chronic's explicit long-lasting medical shade, though diagnosis would still be Greek-family and keep the medical context. Together, diagnosis and chronic pin the sentence to a medical register.
@@ worked_example.problem
- Identify the family (Latin or Greek) of each root in the sentence below, then explain why the sentence reads as formal and specialized rather than everyday. Sentence: "The geographer's chronology of the bioregion depended on a precise taxonomy of the species." Roots to sort: graph-, chrono-, bio-, taxo-, gen- (in geographer).
+ Identify the family (Latin or Greek) of each root in the sentence below, then explain why the sentence reads as formal and specialized rather than everyday. Sentence: "The geographer's chronology of the bioregion depended on a precise taxonomy of the species." Roots to sort: graph-, chrono-, bio-, taxo-, geo- (in geographer).
@@ worked_example.steps[0]
- Step 1: Name the root and its family. graph- is Greek (write). chrono- is Greek (time). bio- is Greek (life). taxo- is Greek (arrange, classify). gen- in geographer is Greek (earth).
+ Step 1: Name the root and its family. graph- is Greek (write). chrono- is Greek (time). bio- is Greek (life). taxo- is Greek (arrange, classify). geo- in geographer is Greek (earth).
@@ worked_example.answer
- All five roots (graph-, chrono-, bio-, taxo-, gen-) are Greek, so the sentence is uniformly formal and technical. If the writer had used Latin-family words, the register would drop to everyday prose.
+ All five roots (graph-, chrono-, bio-, taxo-, geo-) are Greek, so the sentence is uniformly formal and technical. If the writer had used Latin-family words, the register would drop to everyday prose.

### lessons 358 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[3]
- Doing the divide before the subtract in 5x + 2 = 27, which gives x + 2 = 5.4 and then x = 3.4. The correct order gives x = 5.
+ Dividing only the 5x term in 5x + 2 = 27 is the mistake: it gives x + 2 = 5.4 and then x = 3.4. Dividing both sides by 5 first gives x + 0.4 = 5.4, so x = 5.

### lessons 3986 — verified: code checks + MiniMax review + cross-family review
@@ intro
- Algebra is a way of writing a calculation before you know the numbers. In this lesson you will learn what a letter means in an expression, and how to turn the expression into a real number. Everything here uses only multiplication and division.
+ Algebra is a way of writing a calculation before you know the numbers. In this lesson you will learn what a letter means in an expression, and how to turn the expression into a real number. The main rules here use multiplication and division, while the Common Mistakes also include addition.

### lessons 40 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[1]
- Undoing multiplication instead of addition first. In 2x + 3 = 11, dividing by 2 first gives x + 3 = 5.5, then x = 2.5, which is wrong. Subtract 3 first to get 2x = 8, then divide to get x = 4.
+ Dividing only part of an equation. In 2x + 3 = 11, dividing both sides by 2 gives x + 1.5 = 5.5, then x = 4, so dividing first is valid. The wrong answer 2.5 comes from dividing only the 2x term.
@@ common_mistakes[2]
- Adding instead of subtracting. In 2x + 3 = 11, adding 3 to both sides gives 2x = 14 and then x = 7, which fails the check because 2(7) + 3 = 17. The opposite of adding 3 is subtracting 3.
+ Moving the +3 across without changing its sign. In 2x + 3 = 11, adding 3 to both sides gives 2x + 6 = 14, then x = 4. The slip that gives 2x = 14 is moving the +3 across without changing its sign.

### lessons 41 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- Subtracting the x term from one side only. In 3x + 5 = x + 17, subtracting x from just the left gives 2x + 5 = 17 written as 2x + 5 = 17 while the right still has x, so the two sides are no longer equal and every later step is wrong.
+ Subtracting the x term from one side only. In 3x + 5 = x + 17, subtracting x from just the left gives 2x + 5 = x + 17 while the right still has x, so the two sides are no longer equal and every later step is wrong.
@@ check_questions[0].prompt
- In 4x + 3 = x + 15, what should you do first?
+ In 4x + 3 = x + 15, which first step leaves x on only one side?
@@ check_questions[0].rationale
- The x terms are on both sides, so the rule says collect them first by subtracting the smaller x term, x, from both sides. Only after that do you clear the constant.
+ Subtracting x from both sides gives 3x + 3 = 15, so x is on only one side. Subtracting 3 from both sides gives 4x = x + 12, which still has x on both sides.

### lessons 424 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[2]
- In 5x = 20, subtracting 5 from both sides. That gives 5x = 15, which still has x multiplied by 5, so x is not alone.
+ In 5x = 20, subtracting 5 from both sides gives 5x - 5 = 15, not 5x = 15.

### lessons 425 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- Adding the number instead of subtracting it. In x + 6 = 14, adding 6 to both sides gives x = 20, and 20 + 6 = 26 does not equal 14.
+ Adding the number instead of subtracting it. In x + 6 = 14, adding 6 to both sides gives x + 12 = 20, so x = 8, not x = 20.

### lessons 48 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[3]
- Multiplying both sides by 3 when you see 3x = 15, giving x = 45. The 3 is attached by multiplication, so the inverse is division: x = 15 / 3 = 5.
+ Multiplying both sides of 3x = 15 by 3 gives 9x = 45, not x = 45. The 3 is attached by multiplication, so the inverse is division: x = 15 / 3 = 5.

### lessons 50 — verified: code checks + MiniMax review + cross-family review
@@ summary
- Keep the rule from the examples in mind: Subtract 18 from both sides: 7x = 7. Divide by 7: x = 1.
+ Keep the rule from the examples in mind: Undo the constant on both sides, then divide by the coefficient of x.

### lessons 66 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- Adding 7 to both sides of x + 7 = 12 instead of subtracting 7. That gives x = 19, which fails because 19 + 7 = 26, not 12.
+ Adding 7 to both sides of x + 7 = 12 instead of subtracting 7. That gives x + 14 = 19, so x = 5, not x = 19. The slip that gives 19 is writing x = 12 + 7.

### lessons 67 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[2]
- Dividing by 2 before removing the 4 in 2x + 4 = 14. That turns the 4 into 2 as well and gives x + 4 = 7, so x = 3, but 2 x 3 + 4 = 10, not 14.
+ Dividing by 2 before removing the 4 in 2x + 4 = 14 and then writing x + 4 = 7 is a mistake. Dividing both sides by 2 gives x + 2 = 7, so x = 5, and 2 x 5 + 4 = 14.

### lessons 79 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[3]
- Picking the number closest to zero as the smaller one when signs differ. Between -6 and -2, -2 is closer to zero but -6 sits farther left, so -6 is the smaller number.
+ Picking the number closest to zero as the smaller one when signs differ. Between -6 and +2, +2 is closer to zero, but -6 is the smaller number because a negative number is always less than a positive number.

### lessons 80 — verified: code checks + MiniMax review + cross-family review (owner-review agent, 2026-10-24)
@@ common_mistakes[0]
- Adding the 6 to one side only in x + 6 = 15. That gives x = 21 on the left while the right side stays 15, and the check 21 + 6 = 27 fails.
+ Adding the 6 instead of subtracting it in x + 6 = 15, writing x = 15 + 6 = 21. The check 21 + 6 = 27 fails. Subtracting 6 from both sides gives x = 9, and 9 + 6 = 15.
@@ check_questions[2].answer
- She added 6 to the left side only, giving x = 21
+ She added 6 to 15 instead of subtracting it, giving x = 21
@@ check_questions[2].choices[1]
- She added 6 to the left side only, giving x = 21
+ She added 6 to 15 instead of subtracting it, giving x = 21
@@ check_questions[2].rationale
- Only a one-sided add leaves the equation at x = 21 with 15 untouched. The check exposes it: 21 + 6 = 27, not 15.
+ Adding 6 to 15 gives 21, but the 6 has to be undone by subtracting it. The check exposes the slip: 21 + 6 = 27, not 15. The right move, subtracting 6 from both sides, gives x = 9.

### lessons 848 — verified: code checks + MiniMax review + cross-family review
@@ common_mistakes[0]
- Dividing by 2 before removing the + 5 in 2x + 5 = 17. That move gives x + 5 = 8.5 and then x = 3.5, which fails the check because 2(3.5) + 5 = 12, not 17. Subtract 5 first, then divide.
+ Dividing by 2 before removing the + 5 in 2x + 5 = 17 is valid: it gives x + 2.5 = 8.5, so x = 6. The mistake is thinking it gives x + 5 = 8.5; dividing by 2 divides every term on both sides, including the + 5. Subtracting 5 first, then dividing, also works.
