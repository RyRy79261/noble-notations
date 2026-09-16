---
name: writing-style
description: The writing rule for Noble Notations — ASD Simplified Technical English. Use when you write or edit any word a reader sees: a recipe title, a subtitle, a summary, a step, a note, a rationale, the explanation of a tag or an ingredient, or the copy on a screen. Also use when you review that text, or when you are asked what the house style is.
---

# How to write for Noble Notations

Write every word that a person reads in simple technical English. This is
the ASD Simplified Technical English style.

A cook reads this store, often while cooking. Many cooks do not read
English as a first language. The reader holds a phone in one hand. Write
for that reader.

## The seven rules

1. **Use short sentences.** Keep a step to 20 words or fewer.
2. **Put one idea in each sentence, and one action in each step.**
3. **Use the active voice.** Write "Cut the beef into strips of 10 mm".
   Do not write "the beef is then cut into strips".
4. **Use the simple word.** Write "cut", not "butterfly". Write "add",
   not "incorporate".
5. **Use the same word for the same thing each time.** A pan that becomes
   a skillet in the next step reads as a second pan.
6. **Give a number and a unit for each amount, each time and each
   temperature.** Do not write "a good glug" or "until it looks right".
   If nobody measured it, say so in a note.
7. **Do not write a metaphor, a joke, or a sentence that praises the
   dish.** A rationale says what changed and why, in words a cook can act
   on.

If a technical word is the only correct word, use it. Explain it one time
in plain words.

## Where the rule holds

The rule holds for the title, the subtitle, the summary, every step,
every note, every rationale, and the explanation of a tag or an
ingredient. It also holds for the copy on every screen.

The rule does not hold for a quotation from a source. Copy a quotation
exactly, and say who wrote it.

## Examples

| Do not write                                      | Write                                            |
| ------------------------------------------------- | ------------------------------------------------ |
| Butterfly the beef, then season generously.       | Cut the beef along its length. Add 20 g of salt. |
| The mixture is reduced until it looks right.      | Reduce the mixture to 200 ml. This takes 25 min. |
| A good glug of vinegar lifts the whole dish.      | Add 30 ml of vinegar.                            |
| Transfer to a skillet and incorporate the butter. | Put the mixture in the pan. Add the butter.      |

## What this rule is not

It is not a rule about the depth of the content. A science note can carry
a mechanism, a condition and a citation. Say it in short sentences.

It is not enforced by a schema. No schema can tell good prose from bad.
The connector states the rule in its instructions, in `get_started`, on
every write tool that stores prose, and as the resource
`noble-notations://writing-style`. A person reading this file and a model
reading that resource get the same rule.

## Where the same rule lives in the code

`howToWrite` in `src/lib/mcp/guide.ts` is the copy the connector serves.
This file and that constant are kept honest by
`e2e/writing-style.spec.ts`, which fails when one states a rule the other
does not. Change one and change the other in the same commit.

`AGENTS.md` § _Words and writing style_ states the rule for the people who
work on the repository. D-14 in `design/DECISIONS.md` records why the rule
exists.
