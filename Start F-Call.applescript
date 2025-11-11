-- F-Call 起動用AppleScript
-- このスクリプトをアプリケーションとして保存してデスクトップに配置できます

tell application "Terminal"
    activate
    set currentTab to do script "cd /Users/j-fukudamac/Desktop/F-Call && ./start-fcall.sh"
end tell

