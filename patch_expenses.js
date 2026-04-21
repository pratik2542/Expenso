const fs = require('fs');
let text = fs.readFileSync('src/pages/expenses.tsx', 'utf-8');

// Looking for where I might need to make sure the setTimeout matches query invalidation accurately.
text = text.replace(
  `setTimeout(() => {
                        queryClient.invalidateQueries({ queryKey: ['expenses'] }) // Force background sync to fetch remaining data
                        const element = document.getElementById('expense-' + expense.id)
                        if (element) {
                          element.style.transition = 'opacity 0.3s ease'
                          element.style.opacity = '0'
                        }
                        handleCloseExpenseDetails()
                        setExpenses(prev => prev.filter(e => e.id !== expense.id))
                      }, 50)`,
  `setTimeout(() => {
                        queryClient.invalidateQueries({ queryKey: ['expenses'] }) // Force background sync to fetch remaining data
                      }, 50)
                      const element = document.getElementById('expense-' + expense.id)
                      if (element) {
                        element.style.transition = 'opacity 0.3s ease'
                        element.style.opacity = '0'
                      }
                      handleCloseExpenseDetails()
                      setTimeout(() => {
                        setExpenses(prev => prev.filter(e => e.id !== expense.id))
                      }, 300)`
);

fs.writeFileSync('src/pages/expenses.tsx', text);
console.log('patched UI fade-out transition logic');
