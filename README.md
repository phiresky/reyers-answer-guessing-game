This is a social guessing game to play with friends over the internet, everyone in their browser (laptop or phone).

## Lobby

There is a lobby. You can either create a new room or join a room by entering the rooms five letter (random) code. You can also join via a link.

Here you set your name. The name is persisted in the browser. No login is required, but the browser session persists, and you can rejoin by reopening the page if you lose it.

You see a list of the other people in the room.

Next to the name, the following is shown:

- the country flag of the user
- the person who created the game has a crown (they are the moderator)
- the connected status of the user, green if the user was online in the past 20 seconds, yellow if the user has not been seen (with a timer showing how long since they were seen), red if the user quit the browser window.

## Configuration

The moderator can configure the game parameters. 
You configure
- the number of rounds (default 3)
- the initial prompt (text, default "Intruiging Hypothetical Scenarios")
- the time limit per round in seconds (120)

The other players see the game parameters live but cannot change them.

## Game Progress

When the game starts, the server generates a question using AI (using the import { streamText } from 'ai' and @openrouter/ai-sdk-provider packages) based on the inital prompt. The question is streamed to the clients as it is written. The question is tuned to be interesting.

Each player has a text field to enter their answer. The game encourages the answer to be around one sentence, but you can put less or more.

After you have added your own answer, the game chooses another player at random. You then have to enter what you think this person answered with.

After that, you press a done button.

when everyone has pressed done (or after the time limit runs out), the answers of each player are revealed in this format:

Question Text (title format)

Username answered: xxxx
Username2's guess for username's answer: yyyy
Rating: 1-10.
...

The answers are revealed immediately. The rating is shown as a spinner, until the server gets an answer for the rating of the AI for this answer. The server asks the AI to judge each guess on a score of 1 to 10.

At the top, the current player list is always shown - each like in the lobby (crown, online status) plus their score, with a number before it to show the position (dupe positions are shown as 1st place, 1st place, 3rd place (example)). Also next to the name, what the player is currently doing is written (thinking, writing their answer, guessing xx (player name)s answer).

the ranking is based on points. a player gets one point per rating in each round. e.g. if the answer was rated 5 they get five points. points are also displayed in the player list.

at the bottom, there is a next button. you press this button to confirm you are ready for the next round. below there is text  who hasn't pressed it yet. (waiting for xx,yy if there is two or less players remaining, or waiting for 3 players if more)

## Finish

After the game finishes, the final ranking is shown indefinitely. The moderator has a button to move the room back to the lobby to potentially start a new round.





## Tech

everything is written in clean typescript.

requests happen via trpc. event stream happens via trpc subscriptions using SSE. The client sends a ping every 5 seconds (if no other event was sent) to update its online status.