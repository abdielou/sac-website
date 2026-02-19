/**
 * Unit tests for mobile responsiveness of Members table column customization
 * Validates Requirements 5.1, 5.2, 5.3, 5.4
 */

describe('Mobile Responsiveness - Members Table Column Customization', () => {
  describe('Requirement 5.3: ColumnSelector hidden on mobile', () => {
    test('ColumnSelector wrapper has responsive classes (hidden md:block)', () => {
      // This test verifies that the ColumnSelector is wrapped with responsive classes
      // The implementation in app/admin/members/page.js should have:
      // <div className="hidden md:block">
      //   <ColumnSelector ... />
      // </div>
      
      // Read the source file to verify the responsive classes
      const fs = require('fs')
      const path = require('path')
      const filePath = path.join(process.cwd(), 'app/admin/members/page.js')
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      
      // Verify the ColumnSelector is wrapped with responsive classes
      expect(fileContent).toContain('Column Selector - Hidden on mobile')
      expect(fileContent).toContain('<div className="hidden md:block">')
      expect(fileContent).toContain('<ColumnSelector')
    })
  })

  describe('Requirement 5.1 & 5.2: Mobile card layout unaffected', () => {
    test('mobile card layout uses md:hidden class and hardcoded fields', () => {
      const fs = require('fs')
      const path = require('path')
      const filePath = path.join(process.cwd(), 'app/admin/members/page.js')
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      
      // Verify mobile card layout exists with md:hidden
      expect(fileContent).toContain('Mobile card layout')
      expect(fileContent).toContain('md:hidden')
      
      // Verify mobile layout uses hardcoded fields (not visibleColumns)
      expect(fileContent).toContain('member.firstName')
      expect(fileContent).toContain('member.initial')
      expect(fileContent).toContain('member.lastName')
      expect(fileContent).toContain('member.slastName')
      expect(fileContent).toContain('member.email')
      expect(fileContent).toContain('member.sacEmail')
    })
  })

  describe('Requirement 5.4: Desktop table uses dynamic columns', () => {
    test('desktop table uses hidden md:block and visibleColumns', () => {
      const fs = require('fs')
      const path = require('path')
      const filePath = path.join(process.cwd(), 'app/admin/members/page.js')
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      
      // Verify desktop table exists with responsive classes
      expect(fileContent).toContain('Desktop table')
      expect(fileContent).toContain('hidden md:block')
      
      // Verify desktop table uses visibleColumns for dynamic rendering
      expect(fileContent).toContain('visibleColumns.map')
    })
  })

  describe('Responsive breakpoint consistency', () => {
    test('mobile and desktop views use consistent md breakpoint', () => {
      const fs = require('fs')
      const path = require('path')
      const filePath = path.join(process.cwd(), 'app/admin/members/page.js')
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      
      // Count occurrences of md:hidden (mobile) and hidden md:block (desktop)
      const mobileMatches = fileContent.match(/md:hidden/g) || []
      const desktopMatches = fileContent.match(/hidden md:block/g) || []
      
      // Should have at least one mobile layout and one desktop table
      expect(mobileMatches.length).toBeGreaterThanOrEqual(1)
      expect(desktopMatches.length).toBeGreaterThanOrEqual(1)
    })
  })
})
