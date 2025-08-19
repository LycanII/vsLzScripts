const vscode = require("vscode");
const { runForInsert } = require('./generalFuncs');
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

  //--> genertate to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand("LzScripts.InsertToClip", (context) => {
      const editor = vscode.window.activeTextEditor;
      var selection = editor.selection;
      var text = editor.document.getText(selection);
       vscode.window.withProgress({ location: vscode.ProgressLocation.Notification },
                async (progress) => {
                    progress.report({
                        message: 'Running Script!',
                    });
                    await runForInsert(text)
                        .then(res => {
                            vscode.env.clipboard.writeText(res.join('\n')).then((text) => {
                               vscode.window.showInformationMessage('Script copied to Clipboard!');
                            });

                        }).catch(err => { vscode.window.showErrorMessage(err.message); });
                
                        
                }
            );
    }));
    
    //--> generate to new Tab
    context.subscriptions.push(
        vscode.commands.registerCommand('LzScripts.InsertToNewTab', (context) => {
        const editor = vscode.window.activeTextEditor;
        var selection = editor.selection;
        var text = editor.document.getText(selection);
           vscode.window.withProgress({ location: vscode.ProgressLocation.Notification },
                    async (progress) => {
                        progress.report({
                            message: 'Running Script!',
                        });
                        await runForInsert( text)
                            .then(res => {

                                vscode.workspace.openTextDocument({ content: res, language: 'sql' })
                                    .then(doc => { vscode.window.showTextDocument(doc, { preview: false });  })
                                    .catch(rrr => { console.error('Failed to open tab:', rrr); });    
                                 
                                let editor = vscode.window.activeTextEditor;
                                    editor.edit(edit => { edit.insert(new vscode.Position(0, 0), res.join('\n')); });
                                    vscode.window.showInformationMessage('Script copied to New Tab!');

                            }).catch(err => { vscode.window.showErrorMessage(err.message); });
    
                    }
                );    

    }));
}


// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
