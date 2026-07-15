# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a learning repository following the [opentutorials.org JavaScript course](http://opentutorials.org/course/49) (생활코딩), a Korean-language web development tutorial. It contains a single static HTML page (`index.html`) with no build system, package manager, tests, or dependencies.

## Structure

- `index.html` — the only source file. A static page with a `<nav>` linking to course lessons (변수와 상수, 연산자, 함수, 이벤트, 객체) and an `<article>` containing lesson notes. It includes a `#toolbar` with black/white buttons, currently without wired-up event handlers — the course later adds JavaScript to toggle the page's color scheme.

## Development

There are no build, lint, or test commands. To view changes, open `index.html` directly in a browser, or serve it locally (e.g. `python3 -m http.server`).

## Conventions

- Content (headings, lesson notes) is written in Korean; keep new tutorial content consistent with that.
- Changes typically track progress through the opentutorials course, adding HTML/JavaScript incrementally as lessons advance.
