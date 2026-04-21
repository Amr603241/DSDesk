using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Threading;

namespace DSDeskInstaller {
    class Program {
        static void Main(string[] args) {
            // Standard Professional Temp Path for unassigned/un-packaged apps
            string tempBase = Path.Combine(Path.GetTempPath(), "DSDesk_Pro_Final_Extraction");
            string appExe = Path.Combine(tempBase, "DSDesk.exe");

            try {
                // Check if already extracted and functional
                if (!Directory.Exists(tempBase) || !File.Exists(appExe)) {
                    if (Directory.Exists(tempBase)) {
                        try { Directory.Delete(tempBase, true); } catch { }
                    }
                    Directory.CreateDirectory(tempBase);

                    // Extract the embedded FinalPayload.zip
                    using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("FinalPayload.zip")) {
                        if (stream == null) throw new Exception("Critical: Payload resource not found.");
                        
                        string zipPath = Path.Combine(tempBase, "payload.zip");
                        using (FileStream fs = new FileStream(zipPath, FileMode.Create)) {
                            stream.CopyTo(fs);
                        }

                        // High-performance PowerShell extraction (Standard Windows Tool)
                        ProcessStartInfo psi = new ProcessStartInfo();
                        psi.FileName = "powershell.exe";
                        psi.Arguments = string.Format("-WindowStyle Hidden -Command \"Expand-Archive -Path '{0}' -DestinationPath '{1}' -Force\"", zipPath, tempBase);
                        psi.CreateNoWindow = true;
                        psi.UseShellExecute = false;
                        
                        Process p = Process.Start(psi);
                        p.WaitForExit();
                        
                        File.Delete(zipPath);
                    }
                }

                // Launch the application
                ProcessStartInfo startInfo = new ProcessStartInfo(appExe);
                startInfo.WorkingDirectory = tempBase;
                Process.Start(startInfo);

            } catch (Exception ex) {
                // Detailed error for the user to troubleshoot
                Console.WriteLine("DSDesk Final Installer Error: " + ex.Message);
                Console.WriteLine("Please try running as Administrator if the error persists.");
                Thread.Sleep(10000);
            }
        }
    }
}
