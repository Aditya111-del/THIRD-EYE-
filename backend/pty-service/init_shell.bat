@echo off & cls & doskey ls=dir /b $* >nul 2>&1 & doskey clear=cls >nul 2>&1 & doskey pwd=cd >nul 2>&1 & doskey which=where $* >nul 2>&1 & cls
