# Shift Happens

Employee shift scheduling platform: managers publish shifts, employees pick them up, swap them and cover for each other, and everything stays conflict-free.

> University team project (Faculty of Applied Mathematics and Informatics, Ivan Franko National University of Lviv), 2026.

## Idea

Shifts change all the time: someone gets sick, someone needs a day off, two people want the same slot. Shift Happens handles this in one place: no more chaos in group chats.

## Actors

- **Employee**: views own schedule, requests a shift, offers or swaps a shift with a colleague
- **Manager**: creates the schedule, approves or rejects swaps, sees coverage gaps
- **Admin**: manages users, roles and locations

## Key features (planned)

- Weekly schedule with shifts per location and role
- Shift swap and shift cover requests with manager approval
- Conflict detection (overlapping shifts, rest time, max hours)
- Notifications about schedule changes
- Basic analytics: coverage, swap rate, unfilled shifts

## Documentation

| Deliverable | Status |
|---|---|
| Product description (SRS, UML, identity management) | In progress |
| Architecture and concurrency flows | Planned |
| Data, resiliency, security, deployment models | Planned |
| Analytics and monitoring models | Planned |
| Demo and report | Planned |

## Tech stack

To be decided.
